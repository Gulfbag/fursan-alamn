import assert from 'node:assert/strict';
import test from 'node:test';
import { portalSeed } from '../src/platform/seed.mjs';
import {
  IncidentStatuses,
  approveClosureReview,
  canApproveClosure,
  canReadEntity,
  canTransitionIncident,
  completeChecklistTask,
  createDemoState,
  deriveMetrics,
  reviewVideoEvent,
  viewerFor,
} from '../src/platform/domain.mjs';

const state = () => createDemoState(portalSeed);
const record = (current, entity, id) => current[entity].find((item) => item.id === id);

test('ACL: العميل يرى عقده وموقعه وتقريره المجمع المعتمد فقط', () => {
  const current = state();
  const client = viewerFor(current, 'client');
  assert.equal(canReadEntity(current, client, 'sites', record(current, 'sites', 'S01')), true);
  assert.equal(canReadEntity(current, client, 'sites', record(current, 'sites', 'S02')), false);
  assert.equal(canReadEntity(current, client, 'reports', record(current, 'reports', 'R-101')), true);
  assert.equal(canReadEntity(current, client, 'reports', record(current, 'reports', 'R-102')), false);
  assert.equal(canReadEntity(current, client, 'incidents', record(current, 'incidents', 'I-401')), false);
  assert.equal(canReadEntity(current, client, 'videoEvents', record(current, 'videoEvents', 'V-301')), false);
});

test('عزل المستأجر يمنع العميل من رؤية عقد C02 ويقصر المشرف على موقعه', () => {
  const current = state();
  const client = viewerFor(current, 'client');
  const supervisor = viewerFor(current, 'supervisor');
  assert.equal(canReadEntity(current, client, 'contracts', record(current, 'contracts', 'C02')), false);
  assert.equal(canReadEntity(current, supervisor, 'incidents', record(current, 'incidents', 'I-401')), true);
  assert.equal(canReadEntity(current, supervisor, 'incidents', record(current, 'incidents', 'I-403')), false);
});

test('الحارس لا يملك اعتماد مراجعة أو إغلاق بلاغ', () => {
  const current = state();
  const guard = viewerFor(current, 'guard');
  const resolved = record(current, 'incidents', 'I-403');
  assert.equal(canApproveClosure(guard, resolved), false);
  assert.equal(canTransitionIncident(current, guard, record(current, 'incidents', 'I-401'), IncidentStatuses.triaged), false);
});

test('انتقالات البلاغ مقيدة وتسند المشرف إلى موقعه فقط', () => {
  const current = state();
  const supervisor = viewerFor(current, 'supervisor');
  assert.equal(canTransitionIncident(current, supervisor, record(current, 'incidents', 'I-401'), IncidentStatuses.triaged), true);
  assert.equal(canTransitionIncident(current, supervisor, record(current, 'incidents', 'I-401'), IncidentStatuses.closed), false);
  assert.equal(canTransitionIncident(current, supervisor, record(current, 'incidents', 'I-403'), IncidentStatuses.closed), false);
});

test('فصل الواجبات يمنع منشئ البلاغ من اعتماد مراجعته', () => {
  const current = state();
  const operations = viewerFor(current, 'operations');
  const ownIncident = record(current, 'incidents', 'I-403');
  assert.equal(canApproveClosure(operations, ownIncident), false);
  assert.throws(() => approveClosureReview(current, { viewer: operations, incidentId: ownIncident.id }), /closure_review_not_allowed/);
});

test('إشارة الفيديو لا تنشئ بلاغاً قبل اختيار مراجع بشري صريح', () => {
  const current = state();
  const supervisor = viewerFor(current, 'supervisor');
  const before = current.incidents.length;
  assert.equal(record(current, 'videoEvents', 'V-301').reviewStatus, 'pending');
  const reviewed = reviewVideoEvent(current, { viewer: supervisor, eventId: 'V-301', decision: 'follow' });
  assert.equal(reviewed.incidents.length, before);
  assert.equal(record(reviewed, 'videoEvents', 'V-301').reviewStatus, 'follow_up');
});

test('إكمال قائمة التحقق يعمل في ذاكرة العرض ويحدّث مؤشرات الجلسة فقط', () => {
  const current = state();
  const guard = viewerFor(current, 'guard');
  const before = deriveMetrics(current, guard);
  const updated = completeChecklistTask(current, { viewer: guard, taskId: 'T-101' });
  const after = deriveMetrics(updated, guard);
  assert.equal(record(updated, 'tasks', 'T-101').status, 'completed');
  assert.equal(after.openTasks, before.openTasks - 1);
  assert.equal(after.completedTasks, before.completedTasks + 1);
  assert.equal(updated.audit[0].action, 'checklist_completed');
});
