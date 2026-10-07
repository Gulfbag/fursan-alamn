import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistant} from '../server/ai/assistant.mjs';
const config={enabled:true,dataProcessingApproved:true,projectId:'fursan-test-project',location:'us-central1',modelId:'approved-test-model'};
const principal={authenticated:true,subject:'u1',role:'supervisor',tenantId:'t1',permissions:['incident:summarize'],contractIds:['c1'],siteIds:['s1']};
const incident={id:'i1',tenantId:'t1',contractId:'c1',siteId:'s1'};
const sources=[{id:'e1',text:'وردت ملاحظة تشغيلية تحتاج مراجعة.',tenantId:'t1',contractId:'c1',siteId:'s1',approvedForAi:true,containsSensitivePersonalData:false}];
const auth={getClient:async()=>({getAccessToken:async()=>({token:'unit-test-token'})})};
const response=(result,finishReason='STOP')=>({ok:true,json:async()=>({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(result)}]}}]})});
const output={summary:'مسودة تلخص الملاحظة المقدمة.',sourceRefs:['e1'],openQuestions:['من المسؤول عن المتابعة؟']};

test('المساعد معطل افتراضيًا ولا يرسل أي طلب',async()=>{
 let called=false;const svc=createAssistant({fetchImpl:async()=>{called=true;}});
 await assert.rejects(svc.summarize({principal,incident,sources}),e=>e.code==='assistant_disabled');assert.equal(called,false);
});
test('تحتاج المعالجة اعتمادًا مستقلًا حتى عند تفعيل الخدمة',async()=>{
 const svc=createAssistant({config:{...config,dataProcessingApproved:false}});assert.equal(svc.available,false);
});
test('يرفض انتحال الدور أو العقد أو الموقع قبل الاتصال بالنموذج',async()=>{
 let calls=0;const svc=createAssistant({config,auth,fetchImpl:async()=>{calls++;return response(output);}});
 for(const p of [{...principal,authenticated:false},{...principal,role:'guard'},{...principal,tenantId:'t2'},{...principal,contractIds:['c2']},{...principal,siteIds:['s2']}]) await assert.rejects(svc.summarize({principal:p,incident,sources}));
 assert.equal(calls,0);
});
test('يرفض المصادر غير المعتمدة أو الحساسة أو التابعة لعقد آخر',async()=>{
 const svc=createAssistant({config,auth,fetchImpl:async()=>response(output)});
 for(const s of [{...sources[0],contractId:'c2'},{...sources[0],approvedForAi:false},{...sources[0],containsSensitivePersonalData:true}]) await assert.rejects(svc.summarize({principal,incident,sources:[s]}),e=>e.code==='source_scope_denied');
 await assert.rejects(svc.summarize({principal,incident,sources:[]}),e=>e.code==='sources_required');
});
test('يرسل نصًا محدودًا بلا فيديو أو أدوات وينتج مسودة لا إجراء',async()=>{
 let request;const events=[];const svc=createAssistant({config,auth,audit:async e=>events.push(e),fetchImpl:async(url,options)=>{request={url,body:JSON.parse(options.body)};return response(output);}});
 const result=await svc.summarize({principal,incident,sources});
 assert.match(request.url,/^https:\/\/us-central1-aiplatform\.googleapis\.com\/v1\/projects\//);
 assert.equal(request.body.tools,undefined);assert.equal(request.body.generationConfig.responseMimeType,'application/json');
 const content=JSON.parse(request.body.contents[0].parts[0].text);assert.deepEqual(Object.keys(content.sources[0]),['id','text']);
 assert.equal(result.reviewRequired,true);assert.equal(result.status,'draft');assert.equal(result.actionTaken,false);assert.equal(events.length,2);
 assert.equal(incident.status,undefined);
});
test('يرفض مراجع مختلقة أو استجابة مبتورة',async()=>{
 for(const r of [response({...output,sourceRefs:['unknown']}),response(output,'MAX_TOKENS')]){
 const svc=createAssistant({config,auth,fetchImpl:async()=>r});await assert.rejects(svc.summarize({principal,incident,sources}),e=>e.code==='invalid_model_output');
 }
});
test('يرفض إعداد المنطقة أو المعرّفات غير الصحيحة ولا يقبل نطاقًا خارجيًا',()=>{
 assert.throws(()=>createAssistant({config:{...config,location:'https://external.example'}}));
 assert.throws(()=>createAssistant({config:{...config,modelId:'../../other'}}));
});
