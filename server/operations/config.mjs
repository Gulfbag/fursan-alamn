import { URL } from 'node:url';

export class OperationsConfigurationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new OperationsConfigurationError(code); };
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/;
export const OPS_ROLES = Object.freeze(['admin','manager','operator','viewer']);
export const ROLE_PERMISSIONS = Object.freeze({
  admin:['requests:write','clients:write','tasks:write','documents:write','documents:approve','ai:approve','ai:draft','reports:export'],
  manager:['requests:write','clients:write','tasks:write','documents:write','documents:approve','ai:approve','ai:draft','reports:export'],
  operator:['requests:write','tasks:write','documents:write','ai:draft'],
  viewer:[],
});
function flag(value) { return value === 'true'; }
function positive(value, fallback, max) { if (value === undefined || value === '') return fallback; const n=Number(value); if (!Number.isInteger(n)||n<1||n>max) fail('invalid_operations_limit'); return n; }
export function loadOperationsConfig(env=process.env) {
  if (!flag(env.OPS_ENABLED)) return Object.freeze({enabled:false,deploymentMode:'disabled',persistence:'none',aiMode:'local-guidance',paperless:true});
  const appEnv=env.APP_ENV || 'production';
  const authMode=env.OPS_AUTH_MODE || 'iap';
  const storeMode=env.OPS_STORE || 'firestore';
  if (!['iap','development'].includes(authMode)||!['firestore','memory-test'].includes(storeMode)) fail('invalid_operations_mode');
  const isCloud=Boolean(env.K_SERVICE || env.K_REVISION || env.CLOUD_RUN_JOB);
  if ((authMode==='development'||storeMode==='memory-test') && (isCloud||env.NODE_ENV==='production'||appEnv==='production')) fail('development_mode_forbidden');
  if (authMode==='development' && storeMode!=='memory-test') fail('development_requires_test_memory');
  let origin; try { const u=new URL(env.OPS_ORIGIN || ''); if (u.origin !== env.OPS_ORIGIN || u.username || u.password || (u.protocol!=='https:' && !(authMode==='development' && u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)))) fail('invalid_operations_origin'); origin=u.origin; } catch { fail('invalid_operations_origin'); }
  const orgId=env.OPS_ORG_ID || 'fursan';
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(orgId)) fail('invalid_operations_org');
  let roles; try { roles=JSON.parse(env.OPS_ROLE_BINDINGS || '{}'); } catch { fail('invalid_operations_roles'); }
  if (!roles || typeof roles!=='object'||Array.isArray(roles)||Object.getPrototypeOf(roles)!==Object.prototype||Object.keys(roles).length<1||Object.keys(roles).length>100) fail('invalid_operations_roles');
  const roleBindings=Object.create(null);
  for (const [email,role] of Object.entries(roles)) { const normalized=email.trim().toLowerCase(); if (!EMAIL.test(normalized)||!OPS_ROLES.includes(role)||Object.hasOwn(roleBindings,normalized)) fail('invalid_operations_roles'); roleBindings[normalized]=role; }
  if (!Object.values(roleBindings).includes('admin')) fail('operations_admin_required');
  const allowedAssignees=Object.keys(roleBindings).filter(email=>roleBindings[email]!=='viewer');
  const projectId=env.OPS_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || '';
  const databaseId=env.OPS_DATABASE_ID || '';
  if (storeMode==='firestore' && (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)||!/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(databaseId))) fail('named_operations_database_required');
  const iapAudience=env.OPS_IAP_AUDIENCE || '';
  if (authMode==='iap'&&!/^\/projects\/\d+\/locations\/[a-z]+-[a-z]+\d+\/services\/[a-z][a-z0-9-]{1,62}$/.test(iapAudience)) fail('invalid_operations_iap_audience');
  const developmentEmail=(env.OPS_DEVELOPMENT_EMAIL || '').toLowerCase();
  if (authMode==='development'&&!Object.hasOwn(roleBindings,developmentEmail)) fail('invalid_development_principal');
  const aiEnabled=flag(env.OPS_AI_ENABLED);
  const aiRegion=env.OPS_AI_REGION || '';
  const aiModel=env.OPS_AI_MODEL || '';
  if (aiEnabled && (authMode!=='iap'||storeMode!=='firestore'||!flag(env.OPS_AI_DATA_PROCESSING_APPROVED)||!/^\w+-\w+\d+$/.test(aiRegion)||!/^[a-zA-Z0-9_.-]{1,100}$/.test(aiModel))) fail('invalid_operations_ai_configuration');
  if (aiEnabled && aiRegion!==(env.OPS_AI_APPROVED_REGION||'')) fail('operations_ai_region_not_approved');
  return Object.freeze({enabled:true,authMode,storeMode,appEnv,origin,orgId,projectId,databaseId,iapAudience,roleBindings:Object.freeze(roleBindings),allowedAssignees:Object.freeze(allowedAssignees),developmentEmail,deploymentMode:authMode==='development'?'development':appEnv==='staging'?'staging':'production',persistence:storeMode,aiMode:aiEnabled?'vertex':'local-guidance',paperless:true,ai:{enabled:aiEnabled,region:aiRegion,model:aiModel,projectId,dailyLimit:positive(env.OPS_AI_DAILY_LIMIT,10,100),dataProcessingApproved:aiEnabled},readRatePerMinute:positive(env.OPS_READ_RATE,120,600),writeRatePerMinute:positive(env.OPS_WRITE_RATE,30,100)});
}
