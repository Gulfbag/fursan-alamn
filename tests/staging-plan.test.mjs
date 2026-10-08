import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingDeploymentPlan } from '../infra/staging/plan-staging.mjs';

const approved = { STAGING_REGION: 'me-central1' };
test('Staging plan remains deterministic and private for approved Doha', () => {
  const plan = stagingDeploymentPlan(approved);
  assert.equal(plan.project, 'fursan-alamn-staging');
  assert.equal(plan.region, 'me-central1');
  const commands = plan.commands.join('\n');
  assert.ok(commands.includes('--iap'));
  assert.ok(commands.includes('--no-allow-unauthenticated'));
  assert.ok(commands.includes('BRIDGE_RECEIVER_ENABLED=false,FURSAN_MASTER_SYNC=disabled'));
  assert.ok(commands.includes('LEAD_SINK=disabled'));
  assert.ok(commands.includes('--public-access-prevention'));
  assert.ok(!commands.includes('--allow-unauthenticated '));
  assert.ok(!commands.includes('--member=allUsers'));
  assert.ok(!commands.includes('--member=allAuthenticatedUsers'));
  assert.ok(!commands.includes('keys create'));
  assert.ok(!commands.includes('sql instances create'));
  assert.ok(!commands.includes('billing projects link'));
  assert.deepEqual(plan, stagingDeploymentPlan(approved));
});

test('Staging plan rejects production, unavailable region, commands and unverified project numbers', () => {
  for (const project of ['fursan-alamn-prod', 'prod', 'other-company', 'fursan-alamn-staging;echo unsafe']) {
    assert.throws(() => stagingDeploymentPlan({ ...approved, STAGING_PROJECT_ID: project }), /staging_project_required/);
  }
  assert.throws(() => stagingDeploymentPlan(), /approved_available_staging_region_required/);
  assert.throws(() => stagingDeploymentPlan({ STAGING_REGION: 'me-central2' }), /approved_available_staging_region_required/);
  assert.throws(() => stagingDeploymentPlan({ STAGING_REGION: 'me-central1;echo unsafe' }), /approved_available_staging_region_required/);
  assert.throws(() => stagingDeploymentPlan({ ...approved, STAGING_PROJECT_NUMBER: 'unknown;echo unsafe' }), /invalid_project_number/);
  const plan = stagingDeploymentPlan({ ...approved, STAGING_PROJECT_ID: 'fursan-alamn-staging-01', STAGING_PROJECT_NUMBER: '123456789' });
  assert.ok(plan.commands.join('\n').includes('service-123456789@gcp-sa-iap.iam.gserviceaccount.com'));
});
