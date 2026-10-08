import { randomUUID } from 'node:crypto';
import { readJsonBody, RequestError, contentTypeIsJson } from '../validation.mjs';
import { createOperationsIdentity } from './auth.mjs';
import { createOperationsAssistant } from './assistant.mjs';
import { createOperationsService, OperationsError } from './domain.mjs';
import { createMemoryOperationsStore, createFirestoreOperationsStore } from './store.mjs';

const ENTITIES=new Set(['requests','clients','tasks','documents']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const reply=(res,status,payload)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(payload));};
function exact(body,keys) {if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw new OperationsError('unexpected_field');}
function permission(principal,p) {if(!principal.permissions?.includes(p))throw new OperationsError('forbidden',403);}
function publicConfig(config) {return {enabled:Boolean(config.enabled),deploymentMode:config.deploymentMode||'disabled',persistence:config.persistence||'none',aiMode:config.aiMode||'local-guidance',paperless:true};}
function markdown(doc) {return `# ${doc.title}\n\n**المعرف:** ${doc.id}\n**الإصدار:** ${doc.version}\n**الحالة:** ${doc.status}\n**آخر تحديث:** ${doc.updatedAt}\n\n> ملف عمل رقمي؛ الاعتماد الداخلي ليس توقيعًا قانونيًا ولا إصدار عقد.\n\n${doc.content}\n`;}
function limiter({now=()=>Date.now(),maxBuckets=500}={}) {
  const buckets=new Map();
  return (key,max)=>{const time=now();let bucket=buckets.get(key);if(!bucket||time>=bucket.until){if(buckets.size>=maxBuckets){for(const[k,v]of buckets)if(time>=v.until)buckets.delete(k);if(buckets.size>=maxBuckets)throw new OperationsError('rate_limited',429);}bucket={until:time+60000,count:0};buckets.set(key,bucket);}if(++bucket.count>max)throw new OperationsError('rate_limited',429);};
}
export function createOperationsHandler({config,store,service,identify,verifyJwt,assistant,logger=console}={}) {
  if(!config)throw new TypeError('operations config required');
  const backing=store || (config.enabled?(config.storeMode==='memory-test'?createMemoryOperationsStore():createFirestoreOperationsStore({projectId:config.projectId,databaseId:config.databaseId,orgId:config.orgId})):null);
  const domain=service || (config.enabled?createOperationsService({store:backing,orgId:config.orgId}):null);
  const identity=identify || createOperationsIdentity({config,verifyJwt});
  const helper=assistant || (config.enabled?createOperationsAssistant({config,service:domain}):null);
  const take=limiter();
  return async function handle(request,response) {
    const url=new URL(request.url,'http://localhost');
    if(!url.pathname.startsWith('/api/ops/'))return false;
    response.setHeader('cache-control','no-store');response.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    const correlationId=randomUUID();
    try {
      if(!config.enabled&&request.method==='GET'&&url.pathname==='/api/ops/config'){reply(response,200,publicConfig(config));return true;}
      if(!config.enabled)throw new OperationsError('operations_disabled',503);
      const principal=await identity(request);
      const write=['POST','PATCH'].includes(request.method);
      take(`${principal.subject}:${write?'write':'read'}`,write?config.writeRatePerMinute:config.readRatePerMinute);
      if(request.method==='GET'&&url.pathname==='/api/ops/config'){reply(response,200,publicConfig(config));return true;}
      if(request.method==='GET'&&url.pathname==='/api/ops/me'){reply(response,200,{principal,permissions:principal.permissions,assignees:principal.allowedAssignees});return true;}
      if(write){
        if(request.headers.origin!==config.origin||request.headers['x-fursan-intent']!=='operations')throw new OperationsError('origin_not_allowed',403);
        if(!contentTypeIsJson(request.headers['content-type']))throw new OperationsError('unsupported_media_type',415);
        if(!UUID.test(request.headers['idempotency-key']||''))throw new OperationsError('idempotency_key_required');
      }
      if(request.method==='GET'&&url.pathname==='/api/ops/reports/export'){
        permission(principal,'reports:export');take(`${principal.subject}:report`,3);
        response.setHeader('Content-Disposition','attachment; filename="fursan-operations-report.json"');
        reply(response,200,await domain.exportReport(principal));return true;
      }
      if(request.method==='POST'&&url.pathname==='/api/ops/ai/draft'){
        permission(principal,'ai:draft');const body=await readJsonBody(request,8192);exact(body,['requestId','purpose']);
        const draft=await helper.draft(body,principal,{idempotencyKey:request.headers['idempotency-key']});reply(response,200,{draft});return true;
      }
      const parts=url.pathname.slice('/api/ops/'.length).split('/');const [entity,id,action]=parts;
      if(!ENTITIES.has(entity)||parts.length>3||(id&&!UUID.test(id)))throw new OperationsError('not_found',404);
      if(request.method==='GET'&&!id){
        if([...url.searchParams.keys()].some(k=>!['limit','cursor','q','status'].includes(k)))throw new OperationsError('invalid_query');
        const query={limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):50,cursor:url.searchParams.get('cursor')||'',q:url.searchParams.get('q')||'',status:url.searchParams.get('status')||''};
        reply(response,200,await domain.list(entity,query,principal));return true;
      }
      if(request.method==='GET'&&id&&!action){reply(response,200,{item:await domain.get(entity,id,principal)});return true;}
      if(request.method==='GET'&&entity==='documents'&&action==='history'){reply(response,200,{items:await domain.documentHistory(id,principal)});return true;}
      if(request.method==='GET'&&entity==='documents'&&action==='export'){
        if(url.searchParams.get('format')!=='md')throw new OperationsError('unsupported_export_format');
        const doc=await domain.get(entity,id,principal);response.statusCode=200;response.setHeader('content-type','text/markdown; charset=utf-8');response.setHeader('Content-Disposition',`attachment; filename="${doc.id}-v${doc.version}.md"`);response.end(markdown(doc));return true;
      }
      const options={idempotencyKey:request.headers['idempotency-key']};
      if(request.method==='POST'&&!id){permission(principal,`${entity}:write`);const body=await readJsonBody(request,65536);reply(response,201,{item:await domain.create(entity,body,principal,options)});return true;}
      if(request.method==='PATCH'&&id&&!action){permission(principal,`${entity}:write`);const body=await readJsonBody(request,65536);if(!body||typeof body!=='object'||Array.isArray(body))throw new OperationsError('invalid_input');const{version,...input}=body;reply(response,200,{item:await domain.update(entity,id,input,principal,{...options,version})});return true;}
      if(request.method==='POST'&&action==='transition') {permission(principal,`${entity}:write`);const body=await readJsonBody(request,8192);exact(body,['status','version']);reply(response,200,{item:await domain.transition(entity,id,body,principal,options)});return true;}
      if(request.method==='POST'&&entity==='requests'&&action==='ai-approval'){permission(principal,'ai:approve');const body=await readJsonBody(request,8192);exact(body,['version','classification']);reply(response,200,{item:await domain.approveAiUse(id,body,principal,options)});return true;}
      throw new OperationsError('not_found',404);
    }catch(error){
      request.resume();
      const known=Number.isInteger(error.statusCode)&&error.statusCode>=400&&error.statusCode<500||error instanceof RequestError||error instanceof OperationsError;
      const status=known?error.statusCode:503;
      const code=known?error.code:'operations_service_unavailable';
      if(status>=500)logger.error?.({event:'operations_request_failed',correlationId,code:'service_unavailable'});
      reply(response,status,{error:code,correlationId});return true;
    }
  };
}
