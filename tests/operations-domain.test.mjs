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

test('document revisions preserve content hash and approval is internal, with explicit revise path', async () => {
  const { service } = serviceFixture();
  const admin = principal();
  const document = await service.create('documents', {
    title: 'إجراء الحراسة', kind: 'procedure', content: 'المحتوى الأول',
  }, admin, { idempotencyKey: KEY.document });
  assert.equal(document.status, 'draft');
  const review = await service.transition('documents', document.id, { status: 'in_review', version: 1 }, admin, { idempotencyKey: KEY.transition });
  const approved = await service.transition('documents', document.id, { status: 'approved', version: review.version }, admin, { idempotencyKey: KEY.approval });
  assert.equal(approved.approvedBy, 'admin-subject');
  await rejects(service.update('documents', document.id, { content: 'لا تعديل صامت' }, admin, { version: approved.version }), 'document_revise_required', 409);
  const revised = await service.update('documents', document.id, { content: 'المحتوى المعدل', revise: true }, admin, { version: approved.version, idempotencyKey: KEY.draft });
  assert.equal(revised.status, 'draft');
  assert.equal(revised.approvedBy, undefined);

  const history = await service.documentHistory(document.id, admin);
  assert.equal(history.length, 4);
  assert.equal(history.at(-1).content, 'المحتوى المعدل');
  assert.match(history.at(-1).contentSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(history[2].approval.legalSignature, false);
  assert.equal(history[2].approval.type, 'internal_human_approval');
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
