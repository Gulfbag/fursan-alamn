import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import * as domain from '../src/platform/domain.mjs';
import {portalSeed} from '../src/platform/seed.mjs';
const raw=await fs.readFile(new URL('../assets/platform.js',import.meta.url),'utf8');
const script=raw.replace(/^import\s*\{[\s\S]+?from '\.\/platform-domain\.mjs';\s*import \{ portalSeed \} from '\.\/platform-seed\.mjs';/,`const {${Object.keys(domain).join(',')}}=window.__domain; const portalSeed=window.__seed;`);
async function setup(){
 const html=await fs.readFile(new URL('../platform.html',import.meta.url),'utf8');const d=new JSDOM(html,{url:'https://www.fapc.sa/platform.html',runScripts:'outside-only'});
 d.window.__domain=domain;d.window.__seed=portalSeed;d.window.fetch=()=>{throw new Error('External requests are not allowed in the demo');};d.window.eval(script);return d;
}
function role(w,name){const el=w.document.getElementById('role-select');el.value=name;el.dispatchEvent(new w.Event('change',{bubbles:true}));}
function navigate(w,name){w.document.querySelector(`.portal-mobile-nav [data-section="${name}"]`).click();}

test('أدوار العرض موجودة في المحتوى الرئيسي وأقسام الجوال الستة متاحة',async()=>{
 const d=await setup();const w=d.window;assert.ok(w.document.getElementById('role-select').closest('#portal-main'));
 assert.equal(w.document.querySelectorAll('.portal-mobile-nav [data-section]').length,6);
 for(const section of ['overview','incidents','shifts','reports','assistant','integrations']){navigate(w,section);assert.equal(w.document.querySelector(`.portal-mobile-nav [data-section="${section}"]`).getAttribute('aria-current'),'page');}
 assert.match(w.document.getElementById('portal-content').textContent,/لم يربط/);d.window.close();
});
test('العميل لا يرى عقدًا آخر أو بلاغات داخلية في واجهة العرض',async()=>{
 const d=await setup();const w=d.window;role(w,'client');const c=w.document.getElementById('portal-content');assert.match(c.textContent,/C01/);assert.doesNotMatch(c.textContent,/C02/);assert.equal(c.querySelectorAll('.portal-incident,.portal-human-review,.portal-table').length,0);
 navigate(w,'incidents');assert.equal(c.querySelectorAll('[data-action="open-incident-dialog"]').length,0);assert.match(c.textContent,/لا تظهر البلاغات/);d.window.close();
});
test('المساعد ينتج مسودة محلية معلنة دون ذكاء توليدي أو اتصال خارجي',async()=>{
 const d=await setup();const w=d.window;navigate(w,'assistant');w.document.querySelector('[data-action="create-draft"]').click();const c=w.document.getElementById('portal-content');assert.ok(c.querySelector('.portal-draft'));assert.match(c.textContent,/الذكاء التوليدي غير مفعل/);assert.match(c.textContent,/LocalRuleBased/);d.window.close();
});
test('إنجاز قائمة التحقق يحدّث العرض فقط ويعود إلى البيانات الأصلية بجلسة جديدة',async()=>{
 const d=await setup();const w=d.window;const before=w.document.querySelectorAll('[data-action="complete-task"]').length;w.document.querySelector('[data-action="complete-task"]').click();assert.equal(w.document.querySelectorAll('[data-action="complete-task"]').length,before-1);d.window.close();
 const other=await setup();assert.equal(other.window.document.querySelectorAll('[data-action="complete-task"]').length,before);other.window.close();
});
