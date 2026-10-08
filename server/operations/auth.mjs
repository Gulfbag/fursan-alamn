import { OAuth2Client } from 'google-auth-library';
import { ROLE_PERMISSIONS } from './config.mjs';

export class OperationsAuthError extends Error {
  constructor(code,statusCode=401) { super(code); this.code=code; this.statusCode=statusCode; }
}
const deny=(code,status=401)=>{throw new OperationsAuthError(code,status);};
function header(token) {
  if (typeof token!=='string'||token.length>12000||token.split('.').length!==3) deny('authentication_required');
  let h; try {h=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));} catch {deny('invalid_identity');}
  if (h.alg!=='ES256'||typeof h.kid!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(h.kid)) deny('invalid_identity');
  return h;
}
export function createIapJwtVerifier({client=new OAuth2Client(),now=()=>Date.now(),fetchKeys}={}) {
  let cachedKeys=null,expiresAt=0,lastRefresh=0;
  async function keys(kid) {
    const time=now();
    if (!cachedKeys||time>=expiresAt||(!Object.hasOwn(cachedKeys,kid)&&time-lastRefresh>=30000)) {
      const result=fetchKeys?await fetchKeys():await client.getIapPublicKeys();
      cachedKeys=result.pubkeys || result; expiresAt=time+30*60*1000; lastRefresh=time;
    }
    if (!cachedKeys||!Object.hasOwn(cachedKeys,kid)) deny('invalid_identity');
    return cachedKeys;
  }
  return async function verify(token,audience) {
    const h=header(token);let payload;
    try { const ticket=await client.verifySignedJwtWithCertsAsync(token,await keys(h.kid),audience,['https://cloud.google.com/iap'],660); payload=ticket.getPayload(); } catch {deny('invalid_identity');}
    const seconds=now()/1000;
    if (!payload||payload.iss!=='https://cloud.google.com/iap'||payload.aud!==audience||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>256||typeof payload.email!=='string'||!Number.isFinite(payload.iat)||!Number.isFinite(payload.exp)||payload.iat>seconds+30||payload.exp<seconds-30||payload.exp<=payload.iat||payload.exp-payload.iat>660) deny('invalid_identity');
    return payload;
  };
}
export function createOperationsIdentity({config,verifyJwt}={}) {
  if (!config?.enabled) return async()=>deny('operations_disabled',503);
  const verify=verifyJwt || (config.authMode==='iap'?createIapJwtVerifier():null);
  return async function identify(request) {
    let email,subject;
    if (config.authMode==='development') {
      const addr=request.socket?.remoteAddress || '';
      const localAddr=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(addr);
      // Even a local reverse proxy cannot expose the development actor under a public Host.
      const expected=new URL(config.origin);
      if (!localAddr||request.headers.host!==expected.host) deny('development_access_forbidden',403);
      email=config.developmentEmail; subject=`development:${email}`;
    } else {
      const jwt=request.headers['x-goog-iap-jwt-assertion'];
      if (!jwt) deny('authentication_required');
      const claims=await verify(jwt,config.iapAudience);
      email=claims.email.trim().toLowerCase(); subject=claims.sub;
    }
    const role=config.roleBindings[email];
    if (!role) deny('principal_not_authorized',403);
    return Object.freeze({authenticated:true,subject,email,role,orgId:config.orgId,allowedAssignees:config.allowedAssignees,permissions:ROLE_PERMISSIONS[role]});
  };
}
