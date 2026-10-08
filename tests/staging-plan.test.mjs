import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingDeploymentPlan } from '../infra/staging/plan-staging.mjs';

const approved = { STAGING_REGION: 'me-central1', STAGING_NETWORK: 'fursan-staging-vpc', STAGING_SUBNET: 'fursan-staging-doha' };
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

test('Staging plan requires approved isolated network and prints Direct VPC for both services', () => {
  const plan = stagingDeploymentPlan(approved);
  assert.equal(plan.network, 'fursan-staging-vpc');
  assert.equal(plan.subnet, 'fursan-staging-doha');
  const deployments = plan.commands.filter((command) => command.startsWith('gcloud run deploy '));
  assert.equal(deployments.length, 2);
  for (const command of deployments) {
    assert.ok(command.includes('--network=fursan-staging-vpc --subnet=fursan-staging-doha --vpc-egress=private-ranges-only'));
  }
  assert.ok(plan.commands.find((command) => command.startsWith('gcloud builds submit ')).includes('--region=me-central1'));
  assert.throws(() => stagingDeploymentPlan({ STAGING_REGION: 'me-central1' }), /approved_staging_network_and_subnet_required/);
  for (const bad of ['default', 'fursan-prod-vpc', 'fursan-staging-vpc;echo unsafe', `fursan-staging-${'x'.repeat(63)}`]) {
    assert.throws(() => stagingDeploymentPlan({ ...approved, STAGING_NETWORK: bad }), /approved_staging_network_and_subnet_required/);
    assert.throws(() => stagingDeploymentPlan({ ...approved, STAGING_SUBNET: bad }), /approved_staging_network_and_subnet_required/);
  }
});

test('Staging plan supports explicit Dammam after billing access changes without defaulting region', () => {
  const plan = stagingDeploymentPlan({ ...approved, STAGING_REGION: 'me-central2', STAGING_SUBNET: 'fursan-staging-dammam' });
  assert.equal(plan.region, 'me-central2');
  assert.equal(plan.subnet, 'fursan-staging-dammam');
  assert.ok(plan.image.startsWith('me-central2-docker.pkg.dev/'));
  assert.ok(plan.commands.filter((command) => command.startsWith('gcloud run deploy ')).every((command) => command.includes('--region=me-central2')));
});

test('Staging plan rejects production, missing or malformed region, commands and unverified project numbers', () => {
  for (const project of ['fursan-alamn-prod', 'prod', 'other-company', 'fursan-alamn-staging;echo unsafe']) {
    assert.throws(() => stagingDeploymentPlan({ ...approved, STAGING_PROJECT_ID: project }), /staging_project_required/);
  }
  assert.throws(() => stagingDeploymentPlan(), /approved_available_staging_region_required/);
  assert.throws(() => stagingDeploymentPlan({ STAGING_REGION: 'me-central1;echo unsafe' }), /approved_available_staging_region_required/);
  assert.throws(() => stagingDeploymentPlan({ ...approved, STAGING_PROJECT_NUMBER: 'unknown;echo unsafe' }), /invalid_project_number/);
  const plan = stagingDeploymentPlan({ ...approved, STAGING_PROJECT_ID: 'fursan-alamn-staging-01', STAGING_PROJECT_NUMBER: '123456789' });
  assert.ok(plan.commands.join('\n').includes('service-123456789@gcp-sa-iap.iam.gserviceaccount.com'));
});
