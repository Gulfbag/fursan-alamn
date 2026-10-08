import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {loadOperationsConfig} from '../server/operations/config.mjs';
import {createIapJwtVerifier,createOperationsIdentity} from '../server/operations/auth.mjs';
const audience='/projects/810907450670/locations/me-central2/services/fursan-website-staging';
const env={OPS_ENABLED:'true',APP_ENV:'staging',NODE_ENV:'production',K_SERVICE:'fursan-website-staging',OPS_ORIGIN:'https://staging.example.test',OPS_PROJECT_ID:'fursan-alamn-staging',OPS_DATABASE_ID:'fursan-operations-staging',OPS_IAP_AUDIENCE:audience,OPS_ROLE_BINDINGS:'{"owner@example.test":"admin","observer@example.test":"viewer"}'};
const{privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const seconds=Math.floor(Date.now()/1000);
function token(changes={},alg='ES256') {const head=Buffer.from(JSON.stringify({alg,kid:'test-key'})).toString('base64url');const body=Buffer.from(JSON.stringify({iss:'https://cloud.google.com/iap',aud:audience,sub:'verified-owner',email:'owner@example.test',iat:seconds-1,exp:seconds+300,...changes})).toString('base64url');const data=`${head}.${body}`;return `${data}.${sign('sha256',Buffer.from(data),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;}
const verifier=()=>createIapJwtVerifier({fetchKeys:async()=>({'test-key':publicKey.export({format:'pem',type:'spki'})})});
test('النواة معطلة افتراضيًا ومخزنها المسماة ومصدرها ودورها يجب أن يكونا صريحين',()=>{
 assert.equal(loadOperationsConfig({}).enabled,false);
 assert.throws(()=>loadOperationsConfig({...env,OPS_DATABASE_ID:'(default)'}));
 assert.throws(()=>loadOperationsConfig({...env,OPS_ORIGIN:'https://staging.example.test/'}));
 assert.throws(()=>loadOperationsConfig({...env,OPS_ROLE_BINDINGS:'{"owner@example.test":"Owner"}'}));
 assert.throws(()=>loadOperationsConfig({...env,OPS_ROLE_BINDINGS:'{"owner@example.test":"viewer"}'}));
 assert.equal(loadOperationsConfig(env).persistence,'firestore');
});
test('وضع الذاكرة أو هوية التطوير مرفوضان في Cloud Run أو الإنتاج ولا fallback عالمي للذكاء',()=>{
 assert.throws(()=>loadOperationsConfig({...env,OPS_STORE:'memory-test'}));
 assert.throws(()=>loadOperationsConfig({...env,OPS_AUTH_MODE:'development'}));
 assert.throws(()=>loadOperationsConfig({...env,OPS_AI_ENABLED:'true',OPS_AI_DATA_PROCESSING_APPROVED:'true',OPS_AI_REGION:'global',OPS_AI_APPROVED_REGION:'global',OPS_AI_MODEL:'test-model'}));
 assert.throws(()=>loadOperationsConfig({...env,OPS_AI_ENABLED:'true',OPS_AI_DATA_PROCESSING_APPROVED:'true',OPS_AI_REGION:'europe-west4',OPS_AI_APPROVED_REGION:'me-central2',OPS_AI_MODEL:'test-model'}));
});
test('JWT ES256 حقيقي يقبل الجمهور والتوقيع الصحيحين ويرفض تغيير الجمهور والانتهاء وalg none والتوقيع المزور',async()=>{
 const verify=verifier(); assert.equal((await verify(token(),audience)).sub,'verified-owner');
 await assert.rejects(()=>verify(token({aud:audience+'-other'}),audience));
 await assert.rejects(()=>verify(token({exp:seconds-100}),audience));
 await assert.rejects(()=>verify(token({},'none'),audience));
 const parts=token().split('.');parts[1]=Buffer.from(JSON.stringify({email:'evil@example.test'})).toString('base64url');await assert.rejects(()=>verify(parts.join('.'),audience));
});
test('الهوية لا تقبل بريدًا أو دورًا من header أو body بدون JWT موقع ولا تمنح حسابًا غير معتمد',async()=>{
 const identify=createOperationsIdentity({config:loadOperationsConfig(env),verifyJwt:verifier()});
 await assert.rejects(()=>identify({headers:{'x-goog-authenticated-user-email':'accounts.google.com:owner@example.test','x-role':'admin'}}));
 const principal=await identify({headers:{'x-goog-iap-jwt-assertion':token(),'x-role':'viewer'}});assert.equal(principal.role,'admin');assert.deepEqual(principal.allowedAssignees,['owner@example.test']);
 await assert.rejects(()=>identify({headers:{'x-goog-iap-jwt-assertion':token({email:'intruder@example.test'})}}),e=>e.statusCode===403);
});
test('هوية تطوير الذاكرة تعمل محليًا فقط وتمنع Host عام حتى إن كان reverse proxy على loopback',async()=>{
 const config=loadOperationsConfig({...env,NODE_ENV:'development',K_SERVICE:'',OPS_STORE:'memory-test',OPS_AUTH_MODE:'development',OPS_ORIGIN:'http://127.0.0.1:8081',OPS_DEVELOPMENT_EMAIL:'owner@example.test'});
 const identify=createOperationsIdentity({config});
 assert.equal((await identify({socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:8081'}})).role,'admin');
 await assert.rejects(()=>identify({socket:{remoteAddress:'127.0.0.1'},headers:{host:'public.example.test'}}));
 await assert.rejects(()=>identify({socket:{remoteAddress:'8.8.8.8'},headers:{host:'127.0.0.1:8081'}}));
});
