import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';
import { createSheetsSink } from '../server/sheets-sink.mjs';

const FIXED_NOW = new Date('2026-10-07T12:00:00.000Z');

function enabledConfig(overrides = {}) {
  return {
    mode: 'sheets',
    leadSubmissionEnabled: true,
    appOrigin: 'https://www.example.test',
    consentVersion: '2026-10-privacy-v1',
    allowedSourcePages: ['/', '/ar/quote'],
    rateLimit: { limit: 20, windowMs: 60_000 },
    ...overrides,
  };
}

function validLead(overrides = {}) {
  return {
    name: 'شركة مثال',
    company: 'مثال المحدودة',
    phone: '+966 55 333 8111',
    email: 'ops@example.test',
    service: 'guarding',
    city: 'Riyadh',
    sites: 2,
    startDate: '2026-11-01',
    message: 'احتياج مبدئي للحراسة.',
    consent: true,
    website: '',
    locale: 'ar',
    sourcePage: '/ar/quote',
    ...overrides,
  };
}

async function createStaticRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fursan-server-'));
  await mkdir(path.join(root, 'en'), { recursive: true });
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!doctype html><script type="application/ld+json">{"@context":"https://schema.org"}</script>');
  await writeFile(path.join(root, 'en', 'index.html'), '<!doctype html><h1>English</h1>');
  await writeFile(path.join(root, 'assets', 'site.a1b2c3d4.css'), 'body{}');
  await writeFile(path.join(root, 'plan.md'), 'not public');
  await writeFile(path.join(os.tmpdir(), 'fursan-outside-secret.txt'), 'not public');
  await symlink(path.join(os.tmpdir(), 'fursan-outside-secret.txt'), path.join(root, 'assets', 'outside.txt'));
  return root;
}

async function withServer({ config = enabledConfig(), sink, staticRoot, logger = { info() {} } } = {}, run) {
  const app = createApp({ config, sink, staticRoot, now: () => FIXED_NOW, logger });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function post(baseUrl, body, { headers = {}, raw } = {}) {
  return fetch(`${baseUrl}/api/leads`, {
    method: 'POST',
    headers: {
      origin: 'https://www.example.test',
      'content-type': 'application/json',
      ...headers,
    },
    body: raw ?? JSON.stringify(body),
  });
}

test('الحالة المعطلة تعيد 503 و public-config لا يكشف سوى الحقلين المسموحين', async () => {
  const root = await createStaticRoot();
  await withServer({
    config: enabledConfig({ mode: 'disabled', leadSubmissionEnabled: false }),
    staticRoot: root,
  }, async (baseUrl) => {
    const configResponse = await fetch(`${baseUrl}/api/public-config`);
    assert.deepEqual(await configResponse.json(), { leadSubmissionEnabled: false, mode: 'disabled' });

    const response = await post(baseUrl, validLead());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'lead_submission_unavailable' });
  });
});

test('نجاح sink المحقون يكتب عقداً خادمياً واحداً ويعيد 201', async () => {
  const root = await createStaticRoot();
  const calls = [];
  const sink = { async append(lead) { calls.push(lead); return { updatedRows: 1 }; } };
  await withServer({ sink, staticRoot: root }, async (baseUrl) => {
    const response = await post(baseUrl, validLead());
    assert.equal(response.status, 201);
    const answer = await response.json();
    assert.equal(answer.status, 'accepted');
    assert.match(answer.requestId, /^[0-9a-f-]{36}$/);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].consentVersion, '2026-10-privacy-v1');
  assert.equal(calls[0].status, 'new');
  assert.equal(calls[0].sourcePage, '/ar/quote');
  assert.equal(Object.hasOwn(calls[0], 'website'), false);
});

test('نتيجة sink غير المؤكدة لا تدعي نجاحاً', async () => {
  const root = await createStaticRoot();
  const sink = { async append() { return { updatedRows: 0 }; } };
  await withServer({ sink, staticRoot: root }, async (baseUrl) => {
    const response = await post(baseUrl, validLead());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'lead_submission_failed');
  });
});

test('يرفض الحجم الزائد و Origin غير المطابق قبل التخزين', async () => {
  const root = await createStaticRoot();
  let calls = 0;
  const sink = { async append() { calls += 1; return { updatedRows: 1 }; } };
  await withServer({ sink, staticRoot: root }, async (baseUrl) => {
    const oversized = JSON.stringify(validLead({ message: 'x'.repeat(9000) }));
    const tooLarge = await post(baseUrl, null, { raw: oversized });
    assert.equal(tooLarge.status, 413);

    const badOrigin = await post(baseUrl, validLead(), { headers: { origin: 'https://other.example.test' } });
    assert.equal(badOrigin.status, 403);
  });
  assert.equal(calls, 0);
});

test('التحقق يرفض honeypot والحقول غير المتوقعة وغياب الموافقة', async () => {
  const root = await createStaticRoot();
  let calls = 0;
  const sink = { async append() { calls += 1; return { updatedRows: 1 }; } };
  await withServer({ sink, staticRoot: root }, async (baseUrl) => {
    const response = await post(baseUrl, validLead({ website: 'bot', consent: false, attackerField: 'x' }));
    assert.equal(response.status, 400);
    const answer = await response.json();
    assert.equal(answer.error, 'invalid_request');
    assert.deepEqual(new Set(answer.fields), new Set(['unexpected_field', 'consent', 'website']));
  });
  assert.equal(calls, 0);
});

test('الملفات العامة مقتصرة على allowlist وتحمي الأسرار والـ symlink والمسار المتسلل', async () => {
  const root = await createStaticRoot();
  await withServer({ sink: { async append() { return { updatedRows: 1 }; } }, staticRoot: root }, async (baseUrl) => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /sha256-/);
    assert.equal(home.headers.get('cache-control'), 'public, max-age=0, must-revalidate');

    const english = await fetch(`${baseUrl}/en`);
    assert.equal(english.status, 200);

    const asset = await fetch(`${baseUrl}/assets/site.a1b2c3d4.css`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');

    for (const protectedPath of ['/plan.md', '/src/data/company.mjs', '/server/index.mjs', '/.git/HEAD', '/assets/outside.txt', '/%2e%2e%2fplan.md']) {
      const response = await fetch(`${baseUrl}${protectedPath}`);
      assert.equal(response.status, 404, protectedPath);
    }
  });
});

test('موصل Sheets يستخدم RAW وappend واحداً فقط ولا يعيد الشبكة تلقائياً', async () => {
  const seen = [];
  const sink = createSheetsSink({
    spreadsheetId: 'spreadsheet-id',
    sheetName: 'Website_Leads',
    getAccessToken: async () => 'unit-test-token',
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), { status: 200 });
    },
  });
  const result = await sink.append({
    requestId: 'request-id', createdAt: '2026-10-07T12:00:00.000Z', name: '=unsafe', company: '', phone: '+966 55 333 8111', email: '', service: 'guarding', city: '', sites: '', startDate: '', message: '', locale: 'ar', sourcePage: '/', consentVersion: 'v1', status: 'new',
  });
  assert.deepEqual(result, { updatedRows: 1 });
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /valueInputOption=RAW/);
  assert.match(seen[0].url, /insertDataOption=INSERT_ROWS/);
  assert.equal(JSON.parse(seen[0].options.body).values[0][2], '=unsafe');
});

test('إعداد الخادم يقبل مسارات HTML الفعلية للنموذج ويمنع sourcePage المتسلل', async () => {
  const config=loadConfig({LEAD_SINK:'sheets',APP_ORIGIN:'https://www.example.test',FURSAN_SPREADSHEET_ID:'unit-test-sheet',FURSAN_LEADS_SHEET:'Website_Leads'});
  const root=await createStaticRoot();const records=[];const sink={async append(lead){records.push(lead);return{updatedRows:1};}};
  await withServer({config,sink,staticRoot:root},async baseUrl=>{
    for(const sourcePage of ['/quote.html','/en/quote.html','/ar/quote.html']){
      const response=await post(baseUrl,validLead({sourcePage}));assert.equal(response.status,201,sourcePage);
    }
    assert.equal((await post(baseUrl,validLead({sourcePage:'/../server/index.mjs'}))).status,400);
  });
  assert.equal(records.length,3);
});
