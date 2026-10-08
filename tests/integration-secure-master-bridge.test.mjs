import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { loadConfig } from '../server/config.mjs';
import {
  CloudRunBridgeError,
  MAX_CLOUD_RUN_RESPONSE_BYTES,
  canonicalCloudRunOrigin,
  createAdcIdTokenProvider,
  createCloudRunWebsiteSink,
} from '../server/integration/cloud-run-website-sink.mjs';
import {
  ENVELOPE_FIELDS,
  createCloudRunReceiver,
  createGoogleIdTokenVerifier,
  validateLeadEnvelopeExact,
} from '../server/integration/cloud-run-receiver.mjs';
import { ReceiverRuntimeContractError, loadReceiverRuntimeContract } from '../server/integration/receiver-index.mjs';

const ORIGIN = 'https://website-receiver-abc-uc.a.run.app';
const OTHER_ORIGIN = 'https://other-receiver-def-uc.a.run.app';
const CALLER_EMAIL = 'website-staging@project-id.iam.gserviceaccount.com';
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440000';
const FIXED_NOW = new Date('2026-10-07T12:00:00.000Z');

function receiverConfig(overrides = {}) {
  return {
    enabled: true,
    audience: ORIGIN,
    allowedServiceAccountEmails: [CALLER_EMAIL],
    consentVersion: '2026-10-privacy-v1',
    allowedSourcePages: ['/', '/ar/quote'],
    ...overrides,
  };
}

function receiverRuntimeEnv(overrides = {}) {
  return {
    APP_ENV: 'staging',
    BRIDGE_RECEIVER_ENABLED: 'true',
    BRIDGE_AUDIENCE: ORIGIN,
    BRIDGE_ALLOWED_CALLERS: CALLER_EMAIL,
    FURSAN_STAGING_SPREADSHEET_ID: 'staging-only-spreadsheet',
    FURSAN_STAGING_LEADS_SHEET: 'Website_Leads',
    FURSAN_MASTER_SYNC: 'disabled',
    ...overrides,
  };
}

function validEnvelope(overrides = {}) {
  return {
    requestId: REQUEST_ID,
    createdAt: '2026-10-07T12:00:00.000Z',
    name: 'شركة مثال',
    company: 'مثال المحدودة',
    phone: '+966 55 333 8111',
    email: 'ops@example.test',
    service: 'guarding',
    city: 'Riyadh',
    sites: 2,
    startDate: '2026-11-01',
    message: 'احتياج مبدئي للحراسة.',
    locale: 'ar',
    sourcePage: '/ar/quote',
    consentVersion: '2026-10-privacy-v1',
    status: 'new',
    ...overrides,
  };
}

function validClaims(overrides = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: ORIGIN,
    email: CALLER_EMAIL,
    email_verified: true,
    ...overrides,
  };
}

async function withReceiver({ config = receiverConfig(), sink, tokenVerifier, logger = { info() {} } } = {}, run) {
  const app = createCloudRunReceiver({
    config,
    sink,
    tokenVerifier: tokenVerifier || { async verify() { return validClaims(); } },
    logger,
    now: () => FIXED_NOW,
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function receiverRequest(baseUrl, {
  path = '/internal/leads',
  method = 'POST',
  body = validEnvelope(),
  raw,
  headers = {},
} = {}) {
  const options = {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer unit-test-id-token',
      ...headers,
    },
  };
  if (method !== 'GET' && method !== 'HEAD') options.body = raw ?? JSON.stringify(body);
  return fetch(`${baseUrl}${path}`, options);
}

test('عقد إعداد الموقع يغلق افتراضياً ويحمي staging ويقبل bridge أو Sheets في البيئة المسموحة فقط', () => {
  const disabled = loadConfig({});
  assert.equal(disabled.appEnv, 'production');
  assert.equal(disabled.mode, 'disabled');
  assert.equal(disabled.leadSubmissionEnabled, false);

  const productionSheets = loadConfig({
    APP_ENV: 'production',
    LEAD_SINK: 'sheets',
    APP_ORIGIN: 'https://www.example.test',
    FURSAN_SPREADSHEET_ID: 'production-sheet',
    FURSAN_LEADS_SHEET: 'Website_Leads',
  });
  assert.equal(productionSheets.mode, 'sheets');
  assert.equal(productionSheets.leadSubmissionEnabled, true);

  const stagingSheets = loadConfig({
    APP_ENV: 'staging',
    LEAD_SINK: 'sheets',
    APP_ORIGIN: 'https://staging.example.test',
    FURSAN_SPREADSHEET_ID: 'must-not-be-used-in-staging',
    FURSAN_LEADS_SHEET: 'Website_Leads',
  });
  assert.equal(stagingSheets.mode, 'disabled');
  assert.ok(stagingSheets.configurationErrors.includes('LEAD_SINK=sheets is not allowed in staging'));

  const bridge = loadConfig({
    APP_ENV: 'staging',
    LEAD_SINK: 'bridge',
    APP_ORIGIN: 'https://staging.example.test',
    BRIDGE_ORIGIN: ORIGIN,
    BRIDGE_AUDIENCE: `${ORIGIN}/`,
    BRIDGE_ALLOWED_ORIGINS: `${OTHER_ORIGIN},${ORIGIN}`,
  });
  assert.equal(bridge.mode, 'bridge');
  assert.equal(bridge.leadSubmissionEnabled, true);
  assert.deepEqual(bridge.bridge.allowedOrigins, [OTHER_ORIGIN, ORIGIN]);

  const invalidTarget = loadConfig({
    APP_ENV: 'staging', LEAD_SINK: 'bridge', APP_ORIGIN: 'https://staging.example.test',
    BRIDGE_ORIGIN: 'https://receiver.example.test', BRIDGE_AUDIENCE: ORIGIN, BRIDGE_ALLOWED_ORIGINS: ORIGIN,
  });
  assert.equal(invalidTarget.mode, 'disabled');
  assert.ok(invalidTarget.configurationErrors.includes('BRIDGE_ORIGIN must be a canonical Cloud Run origin'));

  const missingTargetInAllowlist = loadConfig({
    APP_ENV: 'staging', LEAD_SINK: 'bridge', APP_ORIGIN: 'https://staging.example.test',
    BRIDGE_ORIGIN: ORIGIN, BRIDGE_AUDIENCE: ORIGIN, BRIDGE_ALLOWED_ORIGINS: OTHER_ORIGIN,
  });
  assert.equal(missingTargetInAllowlist.mode, 'disabled');
  assert.ok(missingTargetInAllowlist.configurationErrors.includes('BRIDGE_ALLOWED_ORIGINS must include BRIDGE_ORIGIN'));
});

test('محمل عقد receiver دالة نقية: staging فقط، callers خدمة موثوقون، وMaster sync محظور', () => {
  const disabled = loadReceiverRuntimeContract({});
  assert.deepEqual(disabled, { enabled: false, port: 8080 });

  const runtime = loadReceiverRuntimeContract(receiverRuntimeEnv());
  assert.equal(runtime.enabled, true);
  assert.equal(runtime.audience, ORIGIN);
  assert.deepEqual(runtime.allowedServiceAccountEmails, [CALLER_EMAIL]);
  assert.equal(runtime.consentVersion, '2026-10-privacy-v1');
  assert.ok(runtime.allowedSourcePages.includes('/ar/quote'));

  assert.throws(
    () => loadReceiverRuntimeContract(receiverRuntimeEnv({ BRIDGE_ALLOWED_CALLERS: '' })),
    ReceiverRuntimeContractError,
  );
  assert.throws(
    () => loadReceiverRuntimeContract(receiverRuntimeEnv({ BRIDGE_ALLOWED_CALLERS: 'person@example.test' })),
    ReceiverRuntimeContractError,
  );
  assert.throws(
    () => loadReceiverRuntimeContract(receiverRuntimeEnv({ APP_ENV: 'production' })),
    ReceiverRuntimeContractError,
  );
  assert.throws(
    () => loadReceiverRuntimeContract(receiverRuntimeEnv({ FURSAN_MASTER_SYNC: 'enabled' })),
    ReceiverRuntimeContractError,
  );
});

test('Cloud Run origin يرفض SSRF والمسارات ويفرض allowlist وaudience مطابقاً', () => {
  for (const candidate of [
    'http://website-receiver-abc-uc.a.run.app',
    'https://run.app',
    'https://website-receiver-abc-uc.a.run.app/internal/leads',
    'https://user@website-receiver-abc-uc.a.run.app',
    'https://website-receiver-abc-uc.a.run.app?next=https://169.254.169.254',
    'https://website-receiver-abc-uc.a.run.app:444',
    'https://website-receiver-abc-uc.a.run.app.evil.test',
    'https://169.254.169.254',
  ]) {
    assert.throws(() => canonicalCloudRunOrigin(candidate), /invalid_cloud_run_origin/, candidate);
  }
  assert.equal(canonicalCloudRunOrigin(`${ORIGIN}/`), ORIGIN);
  assert.throws(() => createCloudRunWebsiteSink({
    origin: ORIGIN,
    allowedOrigins: [OTHER_ORIGIN],
    getIdToken: async () => 'token',
  }), /cloud_run_origin_not_allowed/);
  assert.throws(() => createCloudRunWebsiteSink({
    origin: ORIGIN,
    audience: OTHER_ORIGIN,
    allowedOrigins: [ORIGIN, OTHER_ORIGIN],
    getIdToken: async () => 'token',
  }), /cloud_run_origin_not_allowed/);
});

test('ADC ID-token provider يستعمل GoogleAuth getIdTokenClient ولا يطلب مفتاحاً', async () => {
  const calls = [];
  const provider = await createAdcIdTokenProvider({
    auth: {
      async getIdTokenClient(audience) {
        calls.push(['client', audience]);
        return {
          idTokenProvider: {
            async fetchIdToken(tokenAudience) {
              calls.push(['token', tokenAudience]);
              return 'adc-issued-id-token';
            },
          },
        };
      },
    },
  });
  assert.equal(await provider(ORIGIN), 'adc-issued-id-token');
  assert.equal(await provider(ORIGIN), 'adc-issued-id-token');
  assert.deepEqual(calls, [
    ['client', ORIGIN],
    ['token', ORIGIN],
    ['token', ORIGIN],
  ]);
});

test('Website sink يرسل مرة واحدة إلى endpoint ثابت مع redirect:error ويقبل confirmation المطابق فقط', async () => {
  const seen = [];
  const sink = createCloudRunWebsiteSink({
    origin: ORIGIN,
    allowedOrigins: [ORIGIN],
    getIdToken: async (audience) => {
      assert.equal(audience, ORIGIN);
      return 'id-token-for-test';
    },
    timeoutMs: 250,
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      return new Response(JSON.stringify({ updatedRows: 1, requestId: REQUEST_ID }), { status: 201 });
    },
  });
  const result = await sink.append(validEnvelope());
  assert.deepEqual(result, { updatedRows: 1, requestId: REQUEST_ID });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, `${ORIGIN}/internal/leads`);
  assert.equal(seen[0].options.redirect, 'error');
  assert.equal(seen[0].options.headers['x-serverless-authorization'], 'Bearer id-token-for-test');
  assert.equal(seen[0].options.headers.authorization, 'Bearer id-token-for-test');
  assert.equal(seen[0].options.headers['content-type'], 'application/json');
  assert.ok(seen[0].options.signal instanceof AbortSignal);
  assert.equal(seen[0].options.signal.aborted, true);
});

test('Website sink يغطي stream الرد حتى 4KiB بمهلة واحدة ويلغي القراءة البطيئة أو غير المنتهية بلا PII', async () => {
  const encoder = new TextEncoder();
  function responseBody({ signal, delayMs = 0, never = false }) {
    let timer;
    return new ReadableStream({
      start(controller) {
        const stop = () => {
          clearTimeout(timer);
          try { controller.error(new Error('private receiver response detail')); } catch {}
        };
        signal.addEventListener('abort', stop, { once: true });
        if (never) return;
        timer = setTimeout(() => {
          controller.enqueue(encoder.encode(JSON.stringify({ updatedRows: 1, requestId: REQUEST_ID })));
          controller.close();
        }, delayMs);
      },
      cancel() { clearTimeout(timer); },
    });
  }

  let streamedSignal;
  const streamedSink = createCloudRunWebsiteSink({
    origin: ORIGIN,
    allowedOrigins: [ORIGIN],
    getIdToken: async () => 'token',
    timeoutMs: 200,
    fetchImpl: async (_url, options) => {
      streamedSignal = options.signal;
      return new Response(responseBody({ signal: options.signal, delayMs: 5 }), { status: 201 });
    },
  });
  assert.deepEqual(await streamedSink.append(validEnvelope()), { updatedRows: 1, requestId: REQUEST_ID });
  assert.equal(streamedSignal.aborted, true);

  for (const never of [false, true]) {
    let signal;
    const timedOutSink = createCloudRunWebsiteSink({
      origin: ORIGIN,
      allowedOrigins: [ORIGIN],
      getIdToken: async () => 'token',
      timeoutMs: 15,
      fetchImpl: async (_url, options) => {
        signal = options.signal;
        return new Response(responseBody({ signal, delayMs: 50, never }), { status: 201 });
      },
    });
    await assert.rejects(timedOutSink.append(validEnvelope()), (error) => {
      assert.ok(error instanceof CloudRunBridgeError);
      assert.equal(error.code, 'append_unconfirmed');
      assert.doesNotMatch(error.message, /private|receiver/i);
      return true;
    });
    assert.equal(signal.aborted, true);
  }
});

test('Website sink لا يعيد المحاولة عند فشل الشبكة أو redirect أو رد أكبر من 4KiB، وينظف الخطأ', async () => {
  let attempts = 0;
  const failingSink = createCloudRunWebsiteSink({
    origin: ORIGIN,
    allowedOrigins: [ORIGIN],
    getIdToken: async () => 'super-secret-id-token',
    fetchImpl: async () => {
      attempts += 1;
      throw new Error('authorization: Bearer super-secret-id-token; private receiver detail');
    },
  });
  await assert.rejects(failingSink.append(validEnvelope()), (error) => {
    assert.ok(error instanceof CloudRunBridgeError);
    assert.equal(error.code, 'append_unconfirmed');
    assert.doesNotMatch(error.message, /super-secret|authorization|private receiver/i);
    return true;
  });
  assert.equal(attempts, 1);

  let redirectAttempts = 0;
  const redirectedSink = createCloudRunWebsiteSink({
    origin: ORIGIN,
    allowedOrigins: [ORIGIN],
    getIdToken: async () => 'token',
    fetchImpl: async (_url, options) => {
      redirectAttempts += 1;
      assert.equal(options.redirect, 'error');
      return new Response('', { status: 302, headers: { location: 'https://elsewhere.example' } });
    },
  });
  await assert.rejects(redirectedSink.append(validEnvelope()), CloudRunBridgeError);
  assert.equal(redirectAttempts, 1);

  const oversizedResponseSink = createCloudRunWebsiteSink({
    origin: ORIGIN,
    allowedOrigins: [ORIGIN],
    getIdToken: async () => 'token',
    fetchImpl: async () => new Response('x'.repeat(MAX_CLOUD_RUN_RESPONSE_BYTES + 1), { status: 201 }),
  });
  await assert.rejects(oversizedResponseSink.append(validEnvelope()), CloudRunBridgeError);
});

test('validateLeadEnvelopeExact يقبل العقد الخادمي فقط ولا يعيد body الخام أو consent/website', () => {
  const accepted = validateLeadEnvelopeExact(validEnvelope(), {
    now: FIXED_NOW,
    allowedSourcePages: ['/ar/quote'],
    allowedConsentVersions: ['2026-10-privacy-v1'],
  });
  assert.equal(accepted.valid, true);
  assert.deepEqual(Object.keys(accepted.value), ENVELOPE_FIELDS);
  assert.equal(Object.hasOwn(accepted.value, 'consent'), false);
  assert.equal(Object.hasOwn(accepted.value, 'website'), false);

  const rejected = validateLeadEnvelopeExact(validEnvelope({ consent: true }), {
    now: FIXED_NOW,
    allowedSourcePages: ['/ar/quote'],
    allowedConsentVersions: ['2026-10-privacy-v1'],
  });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.includes('unexpected_field'));
});

test('receiver الصحي يرفض method/CORS-origin وBearer المفقود، وhealthz منفصل', async () => {
  let verifierCalls = 0;
  await withReceiver({
    sink: { async append() { throw new Error('must not append'); } },
    tokenVerifier: { async verify() { verifierCalls += 1; return validClaims(); } },
  }, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const wrongMethod = await receiverRequest(baseUrl, { method: 'GET' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'POST');

    const corsOriginOnly = await receiverRequest(baseUrl, {
      headers: {
        authorization: '',
        origin: 'https://attacker.example',
        'x-goog-authenticated-user-email': CALLER_EMAIL,
      },
    });
    assert.equal(corsOriginOnly.status, 401);
    assert.equal(corsOriginOnly.headers.get('access-control-allow-origin'), null);
    assert.equal(verifierCalls, 0);

    const wrongPath = await receiverRequest(baseUrl, { path: '/internal/other' });
    assert.equal(wrongPath.status, 404);
  });
});

test('receiver يتحقق من Authorization الكامل فقط عند وجود X-Serverless-Authorization الخاص بـIAM', async () => {
  const verifiedTokens = [];
  let appended = 0;
  await withReceiver({
    sink: { async append() { appended += 1; return { updatedRows: 1 }; } },
    tokenVerifier: { async verify({ idToken, audience }) {
      verifiedTokens.push({ idToken, audience });
      return validClaims();
    } },
  }, async (baseUrl) => {
    const accepted = await receiverRequest(baseUrl, {
      headers: {
        authorization: 'Bearer full-application-token',
        'x-serverless-authorization': 'Bearer iam-token-with-signature-removed-before-container',
      },
    });
    assert.equal(accepted.status, 201);

    const iamHeaderOnly = await receiverRequest(baseUrl, {
      headers: {
        authorization: '',
        'x-serverless-authorization': 'Bearer not-an-application-fallback',
      },
    });
    assert.equal(iamHeaderOnly.status, 401);
  });
  assert.deepEqual(verifiedTokens, [{ idToken: 'full-application-token', audience: ORIGIN }]);
  assert.equal(appended, 1);
});

test('receiver يفشل مغلقاً للـ issuer/audience/email/email_verified أو فشل verifier', async () => {
  const byToken = {
    badissuer: validClaims({ iss: 'https://issuer.attacker.example' }),
    badaudience: validClaims({ aud: OTHER_ORIGIN }),
    unknownemail: validClaims({ email: 'other@project-id.iam.gserviceaccount.com' }),
    unverified: validClaims({ email_verified: false }),
    cryptofailure: null,
  };
  let appended = 0;
  await withReceiver({
    sink: { async append() { appended += 1; return { updatedRows: 1 }; } },
    tokenVerifier: { async verify({ idToken, audience }) {
      assert.equal(audience, ORIGIN);
      return byToken[idToken];
    } },
  }, async (baseUrl) => {
    for (const idToken of Object.keys(byToken)) {
      const response = await receiverRequest(baseUrl, { headers: { authorization: `Bearer ${idToken}` } });
      assert.equal(response.status, 403, idToken);
      assert.deepEqual(await response.json(), { error: 'caller_not_allowed' });
    }
  });
  assert.equal(appended, 0);
});

test('Google OAuth verifier يمرر audience إلى verifyIdToken ويستخرج claims فقط بعد التحقق cryptographically', async () => {
  const calls = [];
  const verifier = createGoogleIdTokenVerifier({
    oauth2Client: {
      async verifyIdToken(options) {
        calls.push(options);
        return { getPayload: () => validClaims() };
      },
    },
  });
  assert.deepEqual(await verifier.verify({ idToken: 'signed-token', audience: ORIGIN }), validClaims());
  assert.deepEqual(calls, [{ idToken: 'signed-token', audience: ORIGIN }]);
});

test('receiver المعطل افتراضياً يعيد 503 قبل التحقق أو الكتابة', async () => {
  let verifierCalls = 0;
  let sinkCalls = 0;
  await withReceiver({
    config: {},
    sink: { async append() { sinkCalls += 1; return { updatedRows: 1 }; } },
    tokenVerifier: { async verify() { verifierCalls += 1; return validClaims(); } },
  }, async (baseUrl) => {
    const response = await receiverRequest(baseUrl);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'bridge_unavailable' });
  });
  assert.equal(verifierCalls, 0);
  assert.equal(sinkCalls, 0);
});

test('receiver يحد body بـ8KiB بعد المصادقة ولا يستدعي sink', async () => {
  let sinkCalls = 0;
  await withReceiver({
    sink: { async append() { sinkCalls += 1; return { updatedRows: 1 }; } },
  }, async (baseUrl) => {
    const oversized = JSON.stringify(validEnvelope({ message: 'x'.repeat(9_000) }));
    const response = await receiverRequest(baseUrl, { raw: oversized });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'payload_too_large' });
  });
  assert.equal(sinkCalls, 0);
});

test('receiver ينجح فقط بعد sink محقون مؤكد ولا ينفذ Master sync أو يسجل PII', async () => {
  const appended = [];
  let masterSyncCalls = 0;
  const logged = [];
  const sink = {
    async append(lead) {
      appended.push(lead);
      return { updatedRows: 1 };
    },
    async masterSync() { masterSyncCalls += 1; },
  };
  await withReceiver({
    sink,
    logger: { info(event) { logged.push(event); } },
  }, async (baseUrl) => {
    const response = await receiverRequest(baseUrl, { headers: { origin: 'https://not-used-for-auth.example' } });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { requestId: REQUEST_ID, updatedRows: 1 });
  });
  assert.equal(appended.length, 1);
  assert.equal(masterSyncCalls, 0);
  assert.deepEqual(Object.keys(appended[0]), ENVELOPE_FIELDS);
  assert.deepEqual(logged, [{ event: 'cloud_run_receiver_accepted' }]);
});

test('receiver لا يعيد sink عند فشل غير مؤكد ويغسل تفاصيل الخطأ من response/log', async () => {
  let attempts = 0;
  const logged = [];
  await withReceiver({
    sink: {
      async append() {
        attempts += 1;
        throw new Error('email=ops@example.test authorization=Bearer private-token');
      },
    },
    logger: { info(event) { logged.push(event); } },
  }, async (baseUrl) => {
    const response = await receiverRequest(baseUrl);
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.match(body, /lead_delivery_unconfirmed/);
    assert.doesNotMatch(body, /ops@example|private-token|authorization/i);
  });
  assert.equal(attempts, 1);
  assert.deepEqual(logged, [{ event: 'cloud_run_receiver_append_unconfirmed' }]);
});
