import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const script=await fs.readFile(new URL('../assets/site.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,25));
async function setup(file='quote.html',fetchImpl=async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({leadSubmissionEnabled:false,mode:'disabled'})})){
 const html=await fs.readFile(new URL(`../${file}`,import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:`https://www.fapc.sa/${file}`,runScripts:'outside-only'});
 dom.window.matchMedia=()=>({matches:false,addEventListener(){}});dom.window.fetch=fetchImpl;
 dom.window.AbortSignal=AbortSignal;dom.window.TextEncoder=TextEncoder;
 dom.window.eval(script);await tick();return dom;
}
function validForm(w){
 const form=w.document.getElementById('lead-form');
 form.elements.namedItem('name').value='اختبار تجريبي';form.elements.namedItem('phone').value='+966500000000';form.elements.namedItem('service').value='guarding';form.elements.namedItem('consent').checked=true;return form;
}
function submit(w,form){form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}

test('القائمة تشمل التدريب والمدونة وتغلق بـEscape مع استعادة التركيز',async()=>{
 const d=await setup('index.html');const w=d.window;const b=w.document.getElementById('mobile-menu-btn');b.click();assert.equal(b.getAttribute('aria-expanded'),'true');
 const menu=w.document.getElementById('mobile-menu');assert.equal(menu.hidden,false);assert.match(menu.textContent,/التدريب/);assert.match(menu.textContent,/المدونة/);
 w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(menu.hidden,true);assert.equal(w.document.activeElement,b);d.window.close();
});
test('بحث المدونة والتصنيف يعرضان نتائج حقيقية وحالة فارغة',async()=>{
 const d=await setup('blog.html');const w=d.window;const s=w.document.getElementById('article-search');s.value='المراجعة البشرية';s.dispatchEvent(new w.Event('input'));
 const cards=[...w.document.querySelectorAll('[data-article]')];assert.equal(cards.filter(x=>!x.hidden).length,1);
 s.value='عبارة ليست في المقالات';s.dispatchEvent(new w.Event('input'));assert.equal(w.document.getElementById('no-articles').hidden,false);
 s.value='';s.dispatchEvent(new w.Event('input'));w.document.querySelector('[data-filter="operations"]').click();assert.equal(cards.filter(x=>!x.hidden).length,1);d.window.close();
});
test('النموذج يرفض الحقول الفارغة ولا يدعي حفظًا أو يفتح واتساب',async()=>{
 const d=await setup();const w=d.window;submit(w,w.document.getElementById('lead-form'));await tick();assert.equal(w.document.getElementById('name-error').hidden,false);assert.equal(w.document.getElementById('whatsapp-ready').hidden,true);d.window.close();
});
test('الاستضافة الثابتة تجهز رسالة فقط وتتحقق من موافقة الخصوصية',async()=>{
 let postCount=0;const d=await setup('quote.html',async(_,o)=>{if(o?.method==='POST')postCount++;return{ok:true,headers:{get:()=> 'application/json'},json:async()=>({leadSubmissionEnabled:false})};});
 const w=d.window;const form=validForm(w);form.elements.namedItem('consent').checked=false;submit(w,form);await tick();assert.equal(w.document.getElementById('consent-error').hidden,false);
 form.elements.namedItem('consent').checked=true;submit(w,form);await tick();assert.equal(w.document.getElementById('whatsapp-ready').hidden,false);assert.match(w.document.getElementById('lead-status').textContent,/لم يُحفظ/);assert.equal(postCount,0);d.window.close();
});
test('نجاح الإرسال لا يظهر إلا عند 201 accepted ويمنع إرسالين متزامنين',async()=>{
 let resolvePost;let posts=0;const d=await setup('quote.html',async(_,o)=>{
 if(o?.method==='POST'){posts++;return new Promise(r=>{resolvePost=r;});}
 return{ok:true,headers:{get:()=> 'application/json'},json:async()=>({leadSubmissionEnabled:true})};
 });const w=d.window;const form=validForm(w);submit(w,form);submit(w,form);await tick();assert.equal(posts,1);
 resolvePost({status:201,json:async()=>({status:'accepted',requestId:'unit-test-reference'})});await tick();assert.match(w.document.getElementById('lead-status').textContent,/استُلم الطلب/);assert.equal(w.document.getElementById('whatsapp-ready').hidden,true);d.window.close();
});
test('النتيجة الملتبسة تبين عدم التأكيد ولا تعيد الطلب تلقائيًا',async()=>{
 let posts=0;const d=await setup('quote.html',async(_,o)=>o?.method==='POST'?(posts++,{status:502,json:async()=>({error:'lead_submission_failed',requestId:'unit-test-reference'})}):({ok:true,headers:{get:()=> 'application/json'},json:async()=>({leadSubmissionEnabled:true})}));
 const w=d.window;submit(w,validForm(w));await tick();assert.match(w.document.getElementById('lead-status').textContent,/تعذر تأكيد/);assert.equal(posts,1);assert.equal(w.document.getElementById('whatsapp-ready').hidden,true);d.window.close();
});
