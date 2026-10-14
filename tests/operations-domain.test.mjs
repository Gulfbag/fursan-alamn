import assert from 'node:assert/strict';
import test from 'node:test';

import { createOperationsService, OperationsError } from '../server/operations/domain.mjs';
import { createMemoryOperationsStore } from '../server/operations/store.mjs';

const KEY = Object.freeze({
  request: '11111111-1111-4111-8111-111111111111',
  requestAgain: '22222222-2222-4222-8222-222222222222',
  update: '33333333-3333-4333-8333-333333333333',
  document: '44444444-4444-4444-8444-444444444444',
  transition: '55555555-5555-4555-8555-555555555555',
  approval: '66666666-6666-4666-8666-666666666666',
  draft: '77777777-7777-4777-8777-777777777777',
});

function principal({ subject = 'admin-subject', email = 'admin@example.test', role = 'admin', orgId = 'fursan', allowedAssignees = ['operator@example.test', 'admin@example.test'] } = {}) {
  return { authenticated: true, subject, email, role, orgId, allowedAssignees };
}

function serviceFixture() {
  const store = createMemoryOperationsStore();
  const service = createOperationsService({ store, now: () => new Date('2026-10-08T09:00:00.000Z') });
  return { store, service };
}

async function rejects(promise, code, statusCode) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof OperationsError);
    assert.equal(error.code, code);
    if (statusCode) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

async function createRequest(service, actor = principal(), key = KEY.request) {
  return service.create('requests', {
    title: 'حراسة موقع رئيسي',
    companyName: 'شركة مثال',
    contactName: 'مسؤول الموقع',
    email: 'contact@example.test',
    priority: 'high',
  }, actor, { idempotencyKey: key });
}

test('requests are server-initialized, searchable, and idempotent without duplicate audit', async () => {
  const { store, service } = serviceFixture();
  const admin = principal();
  const created = await createRequest(service, admin);
  assert.equal(created.status, 'new');
  assert.equal(created.version, 1);
  assert.equal(created.orgId, 'fursan');
  assert.equal(created.createdBy, 'admin-subject');
  assert.ok(created.searchTokens.includes('شرك'));

  const repeated = await createRequest(service, admin);
  assert.equal(repeated.id, created.id);
  const audit = await store.list('audit', { limit: 100 });
  const receipts = await store.list('idempotency', { limit: 100 });
  assert.equal(audit.items.length, 1);
  assert.equal(receipts.items.length, 1);

  await rejects(
    service.create('requests', { title: 'مختلف', companyName: 'شركة مثال' }, admin, { idempotencyKey: KEY.request }),
    'idempotency_key_reused',
    409,
  );
  const listed = await service.list('requests', { q: 'شرك' }, admin);
  assert.equal(listed.items.length, 1);
  await rejects(service.list('requests', { q: 'شرك', status: 'new' }, admin), 'query_combination_not_supported');
});

test('RBAC is fail-closed for viewers, client administration, unknown assignees, and other operators', async () => {
  const { service } = serviceFixture();
  const viewer = principal({ role: 'viewer', subject: 'viewer', email: 'viewer@example.test' });
  await rejects(service.create('requests', { title: 'blocked' }, viewer), 'forbidden', 403);

  const operator = principal({ role: 'operator', subject: 'operator-1', email: 'operator@example.test', allowedAssignees: ['operator@example.test'] });
  await rejects(service.create('clients', { name: 'عميل' }, operator), 'forbidden', 403);
  await rejects(
    service.create('requests', { title: 'رفض مسؤول مجهول', assigneeEmail: 'unknown@example.test' }, operator),
    'assignee_not_allowed',
    403,
  );

  const record = await service.create('requests', { title: 'خاص بالمشغل' }, operator, { idempotencyKey: KEY.requestAgain });
  const otherOperator = principal({ role: 'operator', subject: 'operator-2', email: 'other@example.test', allowedAssignees: ['other@example.test'] });
  await rejects(service.update('requests', record.id, { title: 'ليس له' }, otherOperator, { version: 1 }), 'forbidden', 403);
  const changed = await service.update('requests', record.id, { title: 'له' }, operator, { version: 1, idempotencyKey: KEY.update });
  assert.equal(changed.title, 'له');

  // Operators may list company records for coordination, but the preceding
  // write test proves they cannot mutate records outside creator/assignee scope.
  assert.equal((await service.list('requests', {}, otherOperator)).items.length, 1);
  await rejects(service.list('requests', {}, principal({ orgId: 'other' })), 'organization_forbidden', 403);
});

test('unknown/prototype/system fields and stale versions are rejected', async () => {
  const { service } = serviceFixture();
  const admin = principal();
  await rejects(service.create('requests', { title: 'x', status: 'closed' }, admin), 'unexpected_field');
  const poisoned = JSON.parse('{"title":"x","__proto__":{"polluted":true}}');
  await rejects(service.create('requests', poisoned, admin), 'unexpected_field');
  await rejects(
    service.create('documents', { title: 'هوية مزورة', kind: 'procedure', content: 'نص', lastContentEditedBy: 'forged' }, admin),
    'unexpected_field',
  );

  const record = await createRequest(service, admin);
  await rejects(service.update('requests', record.id, { createdBy: 'forged' }, admin, { version: 1 }), 'unexpected_field');
  await rejects(service.update('requests', record.id, { title: 'قديم' }, admin, { version: 99 }), 'version_conflict', 409);
  assert.equal((await service.get('requests', record.id, admin)).version, 1);
});

test('links are checked in the organization before writes and failed creates roll back', async () => {
  const { store, service } = serviceFixture();
  const admin = principal();
  await rejects(
    service.create('tasks', { title: 'مهمة مرتبطة', requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, admin, { idempotencyKey: KEY.requestAgain }),
    'not_found',
    404,
  );
  assert.equal((await store.list('tasks', { limit: 100 })).items.length, 0);
  assert.equal((await store.list('audit', { limit: 100 })).items.length, 0);
  assert.equal((await store.list('idempotency', { limit: 100 })).items.length, 0);

  const client = await service.create('clients', { name: 'العميل المرتبط' }, admin, { idempotencyKey: KEY.update });
  const request = await createRequest(service, admin);
  const task = await service.create('tasks', { title: 'مهمة صحيحة', requestId: request.id, clientId: client.id }, admin, { idempotencyKey: KEY.document });
  assert.equal(task.requestId, request.id);
  assert.equal(task.clientId, client.id);
});

test('document revisions preserve content hash and server-owned identities, with explicit revise path', async () => {
  const { store, service } = serviceFixture();
  // LOCAL SIMULATION ONLY: these are mocked subjects, not Google accounts,
  // IAM grants, or an external identity connection.
  const creator = principal({ subject: 'simulated-admin-creator', email: 'creator@example.test', role: 'admin' });
  const independentApprover = principal({ subject: 'simulated-manager-approver', email: 'approver@example.test', role: 'manager' });
  const document = await service.create('documents', {
    title: 'إجراء الحراسة', kind: 'procedure', content: 'المحتوى الأول',
  }, creator, { idempotencyKey: KEY.document });
  assert.equal(document.status, 'draft');
  assert.equal(document.createdBy, creator.subject);
  assert.equal(document.lastContentEditedBy, creator.subject);
  const review = await service.transition('documents', document.id, { status: 'in_review', version: 1 }, creator, { idempotencyKey: KEY.transition });
  const approved = await service.transition('documents', document.id, { status: 'approved', version: review.version }, independentApprover, { idempotencyKey: KEY.approval });
  assert.equal(approved.approvedBy, independentApprover.subject);
  await rejects(service.update('documents', document.id, { content: 'لا تعديل صامت' }, creator, { version: approved.version }), 'document_revise_required', 409);
  const revised = await service.update('documents', document.id, { content: 'المحتوى المعدل', revise: true }, independentApprover, { version: approved.version, idempotencyKey: KEY.draft });
  assert.equal(revised.status, 'draft');
  assert.equal(revised.approvedBy, undefined);
  assert.equal(revised.lastContentEditedBy, independentApprover.subject);

  const history = await service.documentHistory(document.id, creator);
  assert.equal(history.length, 4);
  assert.equal(history.at(-1).content, 'المحتوى المعدل');
  assert.match(history.at(-1).contentSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(history[2].approval.legalSignature, false);
  assert.equal(history[2].approval.type, 'internal_human_approval');
  assert.equal(history[2].createdBy, independentApprover.subject);
  assert.equal(history[2].lastContentEditedBy, creator.subject);
  const approvalAudit = (await store.list('audit', { limit: 100 })).items.find((item) => (
    item.entity === 'documents' && item.version === approved.version
  ));
  assert.equal(approvalAudit.actorSubject, independentApprover.subject);
});

test('document approval rejects creators and last content editors, without mutation receipts', async () => {
  const { store, service } = serviceFixture();
  // LOCAL SIMULATION ONLY: all principals below are mocked and do not create
  // Google accounts, IAM bindings, or external connections.
  const adminCreator = principal({ subject: 'simulated-admin-creator', email: 'creator@example.test', role: 'admin' });
  const managerCreator = principal({ subject: 'simulated-manager-creator', email: 'manager-creator@example.test', role: 'manager' });
  const managerEditor = principal({ subject: 'simulated-manager-editor', email: 'manager-editor@example.test', role: 'manager' });
  const independentApprover = principal({ subject: 'simulated-manager-approver', email: 'approver@example.test', role: 'manager' });
  const operator = principal({ subject: 'simulated-operator', email: 'operator@example.test', role: 'operator', allowedAssignees: ['operator@example.test'] });
  const viewer = principal({ subject: 'simulated-viewer', email: 'viewer@example.test', role: 'viewer' });

  const adminDocument = await service.create('documents', { title: 'منشأ admin', kind: 'procedure', content: 'محتوى' }, adminCreator);
  const adminReview = await service.transition('documents', adminDocument.id, { status: 'in_review', version: adminDocument.version }, adminCreator);
  const countsBeforeRejectedApproval = await Promise.all(['audit', 'document_revisions', 'idempotency'].map(async (collection) => (
    (await store.list(collection, { limit: 100 })).items.length
  )));
  await rejects(
    service.transition('documents', adminDocument.id, { status: 'approved', version: adminReview.version }, adminCreator, { idempotencyKey: KEY.approval }),
    'self_approval_forbidden',
    403,
  );
  const countsAfterRejectedApproval = await Promise.all(['audit', 'document_revisions', 'idempotency'].map(async (collection) => (
    (await store.list(collection, { limit: 100 })).items.length
  )));
  assert.deepEqual(countsAfterRejectedApproval, countsBeforeRejectedApproval);
  assert.equal((await service.get('documents', adminDocument.id, adminCreator)).version, adminReview.version);
  const independentlyApproved = await service.transition('documents', adminDocument.id, { status: 'approved', version: adminReview.version }, independentApprover);
  assert.equal(independentlyApproved.status, 'approved');
  assert.equal(independentlyApproved.approvedBy, independentApprover.subject);

  const managerDocument = await service.create('documents', { title: 'منشأ manager', kind: 'procedure', content: 'محتوى' }, managerCreator);
  const managerReview = await service.transition('documents', managerDocument.id, { status: 'in_review', version: managerDocument.version }, managerCreator);
  await rejects(
    service.transition('documents', managerDocument.id, { status: 'approved', version: managerReview.version }, managerCreator),
    'self_approval_forbidden',
    403,
  );

  const editedDocument = await service.create('documents', { title: 'محرر مختلف', kind: 'procedure', content: 'النص الأول' }, adminCreator);
  const edited = await service.update('documents', editedDocument.id, { content: 'النص الذي عدله المدير' }, managerEditor, { version: editedDocument.version });
  assert.equal(edited.lastContentEditedBy, managerEditor.subject);
  const editedReview = await service.transition('documents', edited.id, { status: 'in_review', version: edited.version }, managerEditor);
  await rejects(
    service.transition('documents', edited.id, { status: 'approved', version: editedReview.version }, managerEditor),
    'self_approval_forbidden',
    403,
  );
  assert.equal((await service.transition('documents', edited.id, { status: 'approved', version: editedReview.version }, independentApprover)).status, 'approved');

  const operatorDocument = await service.create('documents', { title: 'منشأ المشغل', kind: 'procedure', content: 'محتوى' }, operator);
  const operatorReview = await service.transition('documents', operatorDocument.id, { status: 'in_review', version: operatorDocument.version }, operator);
  await rejects(service.transition('documents', operatorDocument.id, { status: 'approved', version: operatorReview.version }, operator), 'forbidden', 403);
  await rejects(service.transition('documents', operatorDocument.id, { status: 'approved', version: operatorReview.version }, viewer), 'forbidden', 403);
});

test('legacy document approval fails closed until a server-recorded content edit is re-reviewed', async () => {
  const { store, service } = serviceFixture();
  // LOCAL SIMULATION ONLY: this manually seeded row models pre-schema data,
  // not a Firestore migration or an external identity connection.
  const creator = principal({ subject: 'legacy-creator', email: 'creator@example.test', role: 'admin' });
  const contentEditor = principal({ subject: 'legacy-content-editor', email: 'editor@example.test', role: 'manager' });
  const independentApprover = principal({ subject: 'legacy-independent-approver', email: 'approver@example.test', role: 'manager' });
  const legacyId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await store.runTransaction(async (tx) => {
    tx.create('documents', legacyId, {
      id: legacyId,
      orgId: 'fursan',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      createdBy: creator.subject,
      version: 1,
      status: 'in_review',
      title: 'ملف قديم',
      kind: 'procedure',
      content: 'محتوى سابق',
      requestId: '',
      clientId: '',
      revisionIds: [],
      searchTokens: [],
    });
  });

  await rejects(
    service.transition('documents', legacyId, { status: 'approved', version: 1 }, creator),
    'self_approval_forbidden',
    403,
  );
  await rejects(
    service.transition('documents', legacyId, { status: 'approved', version: 1 }, independentApprover),
    'approval_identity_unverified',
    409,
  );
  const reset = await service.update('documents', legacyId, { content: 'محتوى موثق جديد' }, contentEditor, { version: 1 });
  assert.equal(reset.status, 'draft');
  assert.equal(reset.lastContentEditedBy, contentEditor.subject);
  const rereview = await service.transition('documents', legacyId, { status: 'in_review', version: reset.version }, contentEditor);
  assert.equal((await service.transition('documents', legacyId, { status: 'approved', version: rereview.version }, independentApprover)).status, 'approved');
});

test('effective in-review document edits return atomically to draft and require a current re-review', async () => {
  const { service } = serviceFixture();
  // LOCAL SIMULATION ONLY: distinct mocked subjects exercise the policy.
  const creator = principal({ subject: 'simulated-admin-creator', email: 'creator@example.test', role: 'admin' });
  const contentEditor = principal({ subject: 'simulated-manager-editor', email: 'editor@example.test', role: 'manager' });
  const independentApprover = principal({ subject: 'simulated-manager-approver', email: 'approver@example.test', role: 'manager' });
  const document = await service.create('documents', { title: 'قيد المراجعة', kind: 'procedure', content: 'النص الأول' }, creator);
  const review = await service.transition('documents', document.id, { status: 'in_review', version: document.version }, creator);

  await rejects(
    service.update('documents', document.id, { content: 'محاولة قديمة' }, contentEditor, { version: document.version }),
    'version_conflict',
    409,
  );
  const reset = await service.update('documents', document.id, { content: 'نص مراجع فعلياً' }, contentEditor, { version: review.version });
  assert.equal(reset.status, 'draft');
  assert.equal(reset.version, review.version + 1);
  assert.equal(reset.lastContentEditedBy, contentEditor.subject);
  assert.equal(reset.approvedAt, undefined);
  assert.equal(reset.approvedBy, undefined);
  assert.equal(reset.approvedVersion, undefined);
  await rejects(
    service.transition('documents', document.id, { status: 'approved', version: reset.version }, independentApprover),
    'invalid_transition',
    409,
  );
  const rereview = await service.transition('documents', document.id, { status: 'in_review', version: reset.version }, contentEditor);
  const approved = await service.transition('documents', document.id, { status: 'approved', version: rereview.version }, independentApprover);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvedVersion, approved.version);
});

test('AI approval is version-bound, invalidated by request update, and required for saved drafts', async () => {
  const { service } = serviceFixture();
  const admin = principal();
  const request = await createRequest(service, admin);
  const approval = await service.approveAiUse(request.id, { version: request.version, classification: 'non_sensitive' }, admin, { idempotencyKey: KEY.approval });
  assert.equal(approval.aiUseApproval.validForVersion, approval.version);
  const invalidated = await service.update('requests', request.id, { title: 'تحديث الطلب' }, admin, { version: approval.version, idempotencyKey: KEY.update });
  assert.equal(invalidated.aiUseApproval, null);

  const reservation = await service.reserveAiQuota(admin, { dailyLimit: 2 });
  await rejects(service.saveAiDraft({
    requestId: request.id,
    sourceVersion: invalidated.version,
    reservationId: reservation.reservationId,
    reservationDate: reservation.reservationDate,
    title: 'مسودة AI', kind: 'procedure', content: 'نص مراجعة بشرية',
  }, admin, { idempotencyKey: KEY.draft }), 'ai_approval_required', 409);

  const reapproval = await service.approveAiUse(request.id, { version: invalidated.version, classification: 'non_sensitive' }, admin, { idempotencyKey: KEY.requestAgain });
  const nextReservation = await service.reserveAiQuota(admin, { dailyLimit: 2 });
  const draft = await service.saveAiDraft({
    requestId: request.id,
    sourceVersion: reapproval.version,
    reservationId: nextReservation.reservationId,
    reservationDate: nextReservation.reservationDate,
    title: 'مسودة AI', kind: 'procedure', content: 'نص مراجعة بشرية',
  }, admin, { idempotencyKey: KEY.draft });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.aiAssisted, true);
  assert.equal(draft.aiApprovalVersion, reapproval.version);
});

test('transitions enforce terminal states and exports omit contact/content secrets', async () => {
  const { service } = serviceFixture();
  const admin = principal();
  const request = await createRequest(service, admin);
  const reviewed = await service.transition('requests', request.id, { status: 'in_review', version: request.version }, admin, { idempotencyKey: KEY.transition });
  const closed = await service.transition('requests', request.id, { status: 'closed', version: reviewed.version }, admin, { idempotencyKey: KEY.approval });
  await rejects(service.transition('requests', request.id, { status: 'in_review', version: closed.version }, admin), 'invalid_transition', 409);

  const report = await service.exportReport(admin);
  assert.equal(report.aggregate.requests.byStatus.closed, 1);
  assert.equal(report.rows.some((row) => 'email' in row || 'content' in row || 'description' in row), false);
});
