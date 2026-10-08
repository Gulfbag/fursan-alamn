import assert from 'node:assert/strict';
import test from 'node:test';

import { createOperationsAssistant } from '../server/operations/assistant.mjs';
import { createOperationsService, OperationsError } from '../server/operations/domain.mjs';
import { createMemoryOperationsStore } from '../server/operations/store.mjs';

const KEYS = Object.freeze({
  request: '11111111-1111-4111-8111-111111111111',
  approval: '22222222-2222-4222-8222-222222222222',
  draft: '33333333-3333-4333-8333-333333333333',
  secondRequest: '44444444-4444-4444-8444-444444444444',
  secondApproval: '55555555-5555-4555-8555-555555555555',
  update: '66666666-6666-4666-8666-666666666666',
  failed: '77777777-7777-4777-8777-777777777777',
  changed: '88888888-8888-4888-8888-888888888888',
});

function principal() {
  return {
    authenticated: true,
    subject: 'fictional-admin',
    email: 'admin@example.test',
    role: 'admin',
    orgId: 'fursan',
    allowedAssignees: ['admin@example.test'],
    permissions: ['ai:draft'],
  };
}

function modelResponse(result) {
  return {
    ok: true,
    text: async () => JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }],
    }),
  };
}

function enabledConfig() {
  return {
    ai: {
      enabled: true,
      dailyLimit: 3,
      region: 'me-central2',
      projectId: 'fictional-project',
      model: 'fictional-model',
    },
  };
}

function auth() {
  return { getClient: async () => ({ getAccessToken: async () => ({ token: 'mock-token' }) }) };
}

function fixture() {
  let timestamp = new Date('2026-10-08T09:00:00.000Z');
  const store = createMemoryOperationsStore();
  const service = createOperationsService({ store, now: () => new Date(timestamp) });
  return {
    store,
    service,
    setTime(value) { timestamp = new Date(value); },
  };
}

async function approvedRequest(service, actor, { requestKey = KEYS.request, approvalKey = KEYS.approval } = {}) {
  const request = await service.create('requests', {
    title: 'طلب تدريب خيالي غير حساس',
    service: 'حراسة تدريبية',
    city: 'مدينة اختبار',
    description: 'بيانات اختبار مصطنعة للمراجعة فقط.',
  }, actor, { idempotencyKey: requestKey });
  return service.approveAiUse(request.id, {
    version: request.version,
    classification: 'non_sensitive',
  }, actor, { idempotencyKey: approvalKey });
}

async function rejects(promise, code, statusCode) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof OperationsError);
    assert.equal(error.code, code);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('expected asynchronous model call was not observed');
}

test('enabled draft claims actor/key before networking, rejects a running duplicate, and replays one saved document across midnight', async () => {
  const { store, service, setTime } = fixture();
  const actor = principal();
  const request = await approvedRequest(service, actor);
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const assistant = createOperationsAssistant({
    config: enabledConfig(),
    service,
    auth: auth(),
    fetchImpl: async () => {
      calls += 1;
      return pending;
    },
  });

  const first = assistant.draft({ requestId: request.id, purpose: 'action_plan' }, actor, { idempotencyKey: KEYS.draft });
  await waitFor(() => calls === 1);
  await rejects(
    assistant.draft({ requestId: request.id, purpose: 'action_plan' }, actor, { idempotencyKey: KEYS.draft }),
    'ai_draft_in_progress',
    409,
  );
  assert.equal(calls, 1);

  release(modelResponse({ text: 'مسودة تدريبية تحتاج مراجعة بشرية.', sourceRefs: [request.id] }));
  const saved = await first;
  assert.equal(saved.persisted, true);
  assert.equal(saved.status, 'draft');
  assert.equal(calls, 1);

  setTime('2026-10-09T00:05:00.000Z');
  const replayed = await assistant.draft({ requestId: request.id, purpose: 'action_plan' }, actor, { idempotencyKey: KEYS.draft });
  assert.equal(replayed.documentId, saved.documentId);
  assert.equal(replayed.text, saved.text);
  assert.equal(calls, 1);
  const usage = await store.list('ai_usage', { limit: 10 });
  assert.equal(usage.items.length, 1);
  assert.equal(usage.items[0].used, 1);

  await rejects(
    assistant.draft({ requestId: request.id, purpose: 'summary' }, actor, { idempotencyKey: KEYS.draft }),
    'idempotency_key_reused',
    409,
  );
  const second = await approvedRequest(service, actor, { requestKey: KEYS.secondRequest, approvalKey: KEYS.secondApproval });
  await rejects(
    assistant.draft({ requestId: second.id, purpose: 'action_plan' }, actor, { idempotencyKey: KEYS.draft }),
    'idempotency_key_reused',
    409,
  );
  await rejects(
    service.beginAiDraft({ requestId: request.id, purpose: 'action_plan', sourceVersion: request.version + 1 }, actor, { idempotencyKey: KEYS.draft, dailyLimit: 3 }),
    'idempotency_key_reused',
    409,
  );
});

test('a failed job is terminal for its key and does not return a document or make a second model call', async () => {
  const { store, service } = fixture();
  const actor = principal();
  const request = await approvedRequest(service, actor);
  let calls = 0;
  const assistant = createOperationsAssistant({
    config: enabledConfig(),
    service,
    auth: auth(),
    fetchImpl: async () => {
      calls += 1;
      return modelResponse({ text: 'نص لا يطابق المرجع.', sourceRefs: ['not-the-request'] });
    },
  });

  await rejects(
    assistant.draft({ requestId: request.id, purpose: 'summary' }, actor, { idempotencyKey: KEYS.failed }),
    'ai_invalid_output',
    502,
  );
  await rejects(
    assistant.draft({ requestId: request.id, purpose: 'summary' }, actor, { idempotencyKey: KEYS.failed }),
    'ai_draft_failed',
    409,
  );
  assert.equal(calls, 1);
  assert.equal((await store.list('documents', { limit: 10 })).items.length, 0);
  const jobs = await store.list('ai_jobs', { limit: 10 });
  assert.equal(jobs.items.length, 1);
  assert.equal(jobs.items[0].state, 'failed');
  assert.equal(jobs.items[0].failureCode, 'ai_invalid_output');
});

test('completion persists only when the currently approved request remains at the exact claimed source version', async () => {
  const { store, service } = fixture();
  const actor = principal();
  const request = await approvedRequest(service, actor);
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const assistant = createOperationsAssistant({
    config: enabledConfig(),
    service,
    auth: auth(),
    fetchImpl: async () => {
      calls += 1;
      return pending;
    },
  });

  const first = assistant.draft({ requestId: request.id, purpose: 'correspondence' }, actor, { idempotencyKey: KEYS.changed });
  await waitFor(() => calls === 1);
  await service.update('requests', request.id, { title: 'تغيير بعد بدء الاستدلال' }, actor, {
    version: request.version,
    idempotencyKey: KEYS.update,
  });
  release(modelResponse({ text: 'مسودة مراسلة تدريبية.', sourceRefs: [request.id] }));
  await rejects(first, 'ai_source_version_changed', 409);
  assert.equal((await store.list('documents', { limit: 10 })).items.length, 0);
  await rejects(
    assistant.draft({ requestId: request.id, purpose: 'correspondence' }, actor, { idempotencyKey: KEYS.changed }),
    'ai_draft_failed',
    409,
  );
  assert.equal(calls, 1);
});

test('disabled staging mode remains deterministic local guidance and never reaches auth or model networking', async () => {
  const { service } = fixture();
  const actor = principal();
  const request = await service.create('requests', { title: 'طلب توجيه محلي خيالي' }, actor, { idempotencyKey: KEYS.request });
  let calls = 0;
  const assistant = createOperationsAssistant({
    config: { ai: { enabled: false } },
    service,
    auth: { getClient: async () => { throw new Error('must not authenticate'); } },
    fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); },
  });

  const draft = await assistant.draft({ requestId: request.id, purpose: 'action_plan' }, actor, { idempotencyKey: KEYS.draft });
  assert.equal(draft.provider, 'local-guidance');
  assert.equal(draft.persisted, false);
  assert.equal(draft.actionTaken, false);
  assert.match(draft.text, /قواعد وليست تحليلًا من نموذج لغوي/);
  assert.equal(calls, 0);
});
