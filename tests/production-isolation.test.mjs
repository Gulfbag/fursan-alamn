import assert from 'node:assert/strict';
import { mkdtemp, access, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createOperationsApp } from '../server/operations-app.mjs';
import { createWebsiteApp } from '../server/website-app.mjs';
import { loadConfig } from '../server/config.mjs';
import { loadDeploymentProfile, DeploymentProfileError } from '../server/deployment-profile.mjs';
import { loadOperationsConfig } from '../server/operations/config.mjs';
import { createOperationsHandler } from '../server/operations/http.mjs';

const ROOT = new URL('..', import.meta.url);
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';

async function withServer(app, work) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await work(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function mustBeMissing(target) {
  await assert.rejects(access(target));
}

test('website profile يفشل مغلقًا مع OPS متضارب ولا يركب أي API أو أصل operations في HTTP', async () => {
  assert.throws(
    () => loadDeploymentProfile({ FURSAN_DEPLOYMENT_PROFILE: 'website', OPS_ENABLED: 'true' }),
    (error) => error instanceof DeploymentProfileError && error.code === 'website_profile_rejects_operations_configuration',
  );
  assert.throws(
    () => loadDeploymentProfile({ FURSAN_DEPLOYMENT_PROFILE: 'website', LEAD_SINK: 'bridge' }),
    (error) => error instanceof DeploymentProfileError && error.code === 'website_profile_requires_lead_sink_disabled',
  );
  assert.equal(loadDeploymentProfile({ FURSAN_DEPLOYMENT_PROFILE: 'website', OPS_ENABLED: 'false', OPS_AI_ENABLED: 'false' }).profile, 'website');

  const app = createWebsiteApp({
    config: loadConfig({ APP_ENV: 'production', LEAD_SINK: 'disabled' }),
    staticRoot: path.resolve(ROOT.pathname),
    operationsHandler: () => { throw new Error('website must not invoke operations handlers'); },
  });
  await withServer(app, async (base) => {
    for (const pathname of [
      '/operations.html', '/en/operations.html', '/assets/operations.js', '/assets/operations.css',
      '/api/ops/config', '/api/ops/reports/export',
      `/api/ops/documents/${DOCUMENT_ID}/history`,
      `/api/ops/documents/${DOCUMENT_ID}/export?format=md`,
    ]) {
      const response = await fetch(`${base}${pathname}`);
      assert.equal(response.status, 404, pathname);
      assert.equal(response.headers.get('access-control-allow-origin'), null, pathname);
      assert.equal(response.headers.get('set-cookie'), null, pathname);
    }
  });
});

test('operations profile يفرض أصل الإنتاج وإلغاء lead/AI/Master قبل listener', () => {
  const required = {
    FURSAN_DEPLOYMENT_PROFILE: 'operations', OPS_ENABLED: 'true', APP_ENV: 'production',
    OPS_ORIGIN: 'https://ops.fapc.sa', LEAD_SINK: 'disabled', FURSAN_MASTER_SYNC: 'disabled', OPS_AI_ENABLED: 'false',
  };
  assert.equal(loadDeploymentProfile(required).profile, 'operations');
  for (const [patch, code] of [
    [{ OPS_ORIGIN: 'https://www.fapc.sa' }, 'production_operations_origin_must_be_ops_fapc_sa'],
    [{ LEAD_SINK: 'bridge' }, 'operations_profile_rejects_marketing_lead_sink'],
    [{ OPS_AUTH_MODE: 'development' }, 'operations_profile_requires_iap'],
    [{ OPS_STORE: 'memory-test' }, 'operations_profile_requires_firestore'],
    [{ FURSAN_MASTER_SYNC: 'enabled' }, 'operations_profile_requires_master_sync_disabled'],
    [{ OPS_AI_ENABLED: 'true' }, 'operations_profile_requires_ai_disabled'],
  ]) {
    assert.throws(
      () => loadDeploymentProfile({ ...required, ...patch }),
      (error) => error instanceof DeploymentProfileError && error.code === code,
    );
  }
});

test('معاينة الإنتاج المحمية تقبل ops خلف الموازن فقط وترفض run.app مع audience وproject وdatabase مطابقين', () => {
  const preview = {
    FURSAN_DEPLOYMENT_PROFILE: 'operations', OPS_ENABLED: 'true', APP_ENV: 'production',
    OPS_ORIGIN: 'https://ops.fapc.sa',
    OPS_PREVIEW_ONLY: 'true', OPS_IAP_AUDIENCE: '/projects/123456789012/locations/me-central2/services/fursan-operations-prod',
    OPS_PROJECT_ID: 'fursan-platform-prod', OPS_DATABASE_ID: 'fursan-operations-prod',
  };
  assert.equal(loadDeploymentProfile(preview).previewOnly, true);
  for (const patch of [
    { OPS_ORIGIN: 'https://www.fapc.sa' },
    { OPS_ORIGIN: 'https://fursan-operations-prod-123456789012.me-central2.run.app' },
    { OPS_ORIGIN: 'https://fursan-operations-prod-999999999999.me-central2.run.app' },
    { OPS_ORIGIN: 'https://evil.example' },
    { OPS_IAP_AUDIENCE: '/projects/123456789012/locations/us-central1/services/fursan-operations-prod' },
    { OPS_PROJECT_ID: 'fursan-alamn-staging' },
    { OPS_DATABASE_ID: 'fursan-operations-staging' },
    { OPS_IAP_AUDIENCE: '/projects/123456789012/locations/me-central2/services/fursan-website-prod' },
  ]) assert.throws(() => loadDeploymentProfile({ ...preview, ...patch }), (e) => e.code === 'invalid_protected_production_preview_origin');
  assert.equal(loadDeploymentProfile({ ...preview, OPS_PREVIEW_ONLY: 'false' }).previewOnly, false);
  assert.throws(() => loadDeploymentProfile({ ...preview, OPS_PREVIEW_ONLY: 'false', OPS_ORIGIN: 'https://fursan-operations-prod-123456789012.me-central2.run.app' }), (e) => e.code === 'production_operations_origin_must_be_ops_fapc_sa');
});

test('operations HTTP لا يقدم صفحات/أصول/API تسويقية ويبقى noindex بلا CORS أو cookie مشترك', async () => {
  const config = loadOperationsConfig({ OPS_ENABLED: 'false' });
  const app = createOperationsApp({
    config,
    operationsHandler: createOperationsHandler({ config }),
    staticRoot: path.resolve(ROOT.pathname),
  });
  await withServer(app, async (base) => {
    for (const pathname of ['/', '/index.html', '/en/index.html', '/assets/site.css', '/assets/site.js', '/api/public-config', '/api/leads']) {
      const response = await fetch(`${base}${pathname}`);
      assert.equal(response.status, 404, pathname);
    }
    const page = await fetch(`${base}/operations.html`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.equal(page.headers.get('access-control-allow-origin'), null);
    assert.equal(page.headers.get('set-cookie'), null);
    assert.match(await page.text(), /data-ops-environment/);
  });
});

test('مُحضّر runtime ينشئ جذورًا منفصلة ولا تضع طبقة website SDK أو شيفرة operations', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'fursan-runtime-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/prepare-runtime.mjs'], {
      cwd: ROOT,
      env: { ...process.env, FURSAN_RUNTIME_DIST_DIR: output },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const relative of ['operations.html', 'en/operations.html', 'assets/operations.js', 'assets/operations.css']) {
      await mustBeMissing(path.join(output, 'website', relative));
    }
    for (const relative of ['index.html', 'en/index.html', 'assets/site.css', 'assets/site.js', 'assets/platform.js']) {
      await mustBeMissing(path.join(output, 'operations', relative));
    }
    assert.ok((await readFile(path.join(output, 'operations', 'robots.txt'), 'utf8')).includes('Disallow: /'));
    const dockerfile = await readFile(path.resolve(ROOT.pathname, 'Dockerfile'), 'utf8');
    const websiteStage = dockerfile.slice(dockerfile.indexOf('AS website'), dockerfile.indexOf('AS operations\n'));
    assert.doesNotMatch(websiteStage, /node_modules|server\/operations|@google-cloud\/firestore/);
    assert.match(dockerfile, /AS operations/);
    assert.match(dockerfile, /AS combined/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
