import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load} from 'cheerio';
const root=new URL('../',import.meta.url);
function luminance(hex){const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}

test('ألوان الهوية الأساسية مطابقة للتوجيه المعتمد في الموقع والبوابة',async()=>{
 const css=await fs.readFile(new URL('src/styles.css',root),'utf8');const portal=await fs.readFile(new URL('assets/platform.css',root),'utf8');
 assert.match(css,/--color-navy:#0D1E2A;/);assert.match(css,/--color-gold:#C9A227;/);assert.match(portal,/--portal-navy:#0D1E2A;/);assert.match(portal,/--portal-gold:#C9A227;/);
 assert.doesNotMatch(css+portal,/#0A2463/i);assert.match(css,/font-family:'Philosopher'/);assert.match(css,/font-family:'Noto Sans'/);
});
test('تباين النص الأبيض والذهبي على الأزرق والنص الأزرق على الذهبي يجتاز AA',()=>{
 for(const [fg,bg] of [['#FFFFFF','#0D1E2A'],['#C9A227','#0D1E2A'],['#0D1E2A','#C9A227'],['#806316','#FFFFFF']])assert.ok(contrast(fg,bg)>=4.5,`${fg} on ${bg}`);
 assert.ok(contrast('#C9A227','#FFFFFF')<4.5,'Base gold must not be normal text on white');
});
test('الصفحات تستخدم اللون المعتمد وأصولًا بإصدار صحيح دون صورة حصان هولوجرافية',async()=>{
 const manifest=JSON.parse(await fs.readFile(new URL('manus-routes.json',root),'utf8'));
 for(const route of manifest.routes){
  const relative=route.path.replace(/^\//,'');const file=!relative||relative.endsWith('/')?relative+'index.html':relative;
  const $=load(await fs.readFile(new URL(file,root),'utf8'));
  assert.equal($('meta[name="theme-color"]').attr('content'),'#0D1E2A',route.path);
  assert.equal($('img[src*="digital-horse"]').length,0,route.path);
  for(const element of $('link[rel="stylesheet"],script[src]').toArray()){
   const reference=$(element).attr('href')||$(element).attr('src');const u=new URL(reference,'https://www.fapc.sa');
   if(!/\/assets\/(?:site|platform)\.(?:css|js)$/.test(u.pathname))continue;
   const bytes=await fs.readFile(new URL(u.pathname.slice(1),root));assert.equal(u.searchParams.get('v'),createHash('sha256').update(bytes).digest('hex').slice(0,12),route.path+' '+reference);
  }
 }
});
