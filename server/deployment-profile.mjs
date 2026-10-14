export class DeploymentProfileError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DeploymentProfileError';
    this.code = code;
  }
}

const fail = (code) => { throw new DeploymentProfileError(code); };
const PROFILES = new Set(['combined', 'website', 'operations']);

function value(env, name, fallback = '') {
  const candidate = env[name];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback;
}

function operationsVariablesPresent(env) {
  return Object.entries(env).some(([name, candidate]) => (
    name.startsWith('OPS_')
    && name !== 'OPS_ENABLED'
    && typeof candidate === 'string'
    && candidate.trim()
  ));
}

/**
 * يحدد هذا الملف سطح التشغيل قبل إنشاء listener. لا يحمّل نواة العمليات أو
 * Firestore؛ لذلك يمكن لصورة website أن تستخدمه من دون إدخال SDK أو شيفرة
 * العمليات إلى طبقة runtime الخاصة بها.
 */
export function loadDeploymentProfile(env = process.env, { expected } = {}) {
  const profile = value(env, 'FURSAN_DEPLOYMENT_PROFILE', 'combined').toLowerCase();
  if (!PROFILES.has(profile)) fail('invalid_deployment_profile');
  if (expected && profile !== expected) fail(`deployment_profile_must_be_${expected}`);

  const appEnv = value(env, 'APP_ENV', 'production').toLowerCase();
  const leadSink = value(env, 'LEAD_SINK', 'disabled').toLowerCase();
  const operationsEnabled = value(env, 'OPS_ENABLED', 'false').toLowerCase() === 'true';
  const masterSync = value(env, 'FURSAN_MASTER_SYNC', 'disabled').toLowerCase();
  const aiEnabled = value(env, 'OPS_AI_ENABLED', 'false').toLowerCase() === 'true';

  if (!['production', 'staging'].includes(appEnv)) fail('invalid_profile_app_env');
  if (profile === 'website') {
    if (operationsEnabled || operationsVariablesPresent(env)) fail('website_profile_rejects_operations_configuration');
    if (leadSink !== 'disabled') fail('website_profile_requires_lead_sink_disabled');
    if (masterSync !== 'disabled') fail('website_profile_requires_master_sync_disabled');
  }

  if (profile === 'operations') {
    if (!operationsEnabled) fail('operations_profile_requires_ops_enabled');
    if (leadSink !== 'disabled') fail('operations_profile_rejects_marketing_lead_sink');
    if (value(env, 'OPS_AUTH_MODE', 'iap').toLowerCase() !== 'iap') fail('operations_profile_requires_iap');
    if (value(env, 'OPS_STORE', 'firestore').toLowerCase() !== 'firestore') fail('operations_profile_requires_firestore');
    if (masterSync !== 'disabled') fail('operations_profile_requires_master_sync_disabled');
    if (aiEnabled) fail('operations_profile_requires_ai_disabled');
    if (appEnv === 'production' && value(env, 'OPS_ORIGIN') !== 'https://ops.fapc.sa') {
      fail('production_operations_origin_must_be_ops_fapc_sa');
    }
  }

  return Object.freeze({ profile, appEnv, leadSink, operationsEnabled });
}
