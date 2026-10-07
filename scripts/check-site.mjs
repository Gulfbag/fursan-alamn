import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { company } from '../src/data/content.mjs';
const root=path.resolve(import.meta.dirname,'..');
const config=JSON.parse(await fs.readFile(path.join(root,'manus-routes.json'),'utf8'));
const failures=[];let links=0;
const filesForRoute=r=>path.join(root,r==='/'?'index.html':r.endsWith('/')?r.slice(1)+'index.html':r.slice(1));
const exists=async p=>{try{return (await fs.stat(p)).isFile();}catch{return false;}};
for(const route of config.routes){
  const file=filesForRoute(route.path);
  if(!await exists(file)){failures.push(`${route.path}: missing HTML`);continue;}
  const $=load(await fs.readFile(file,'utf8'));
  const lang=route.path.startsWith('/en/')?'en':'ar';
  if($('html').attr('lang')!==lang || $('html').attr('dir')!==(lang==='ar'?'rtl':'ltr')) failures.push(`${route.path}: incorrect language/direction`);
  if($('h1').length!==1) failures.push(`${route.path}: expected one h1`);
  if(!$('title').text().trim()||!$('meta[name="description"]').attr('content')) failures.push(`${route.path}: missing metadata`);
  if(route.kind==='demo') {
    if(!$('meta[name="robots"]').attr('content')?.includes('noindex')) failures.push(`${route.path}: demo must not be indexed`);
  } else {
    if($('link[rel="canonical"]').attr('href')!==company.origin+route.path) failures.push(`${route.path}: canonical mismatch`);
    if($('link[hreflang="ar"]').length!==1||$('link[hreflang="en"]').length!==1) failures.push(`${route.path}: missing language equivalents`);
  }
  if($('img').toArray().some(el=>!$(el).attr('alt')||!$(el).attr('width')||!$(el).attr('height'))) failures.push(`${route.path}: image alt/dimensions`);
  if($('[onclick], [onsubmit], [style]').length) failures.push(`${route.path}: inline event/style violates CSP`);
  if($('script[src^="http"]').length||$('link[href*="fonts.googleapis.com"]').length) failures.push(`${route.path}: external runtime dependency`);
  for(const script of $('script[type="application/ld+json"]').toArray()) try{JSON.parse($(script).text());}catch{failures.push(`${route.path}: invalid JSON-LD`);}
  for(const el of $('[href], [src]').toArray()){
    const value=$(el).attr('href')||$(el).attr('src');
    if(!value)continue;
    if(value==='#'){failures.push(`${route.path}: dead # link`);continue;}
    if(/^(https?:|mailto:|tel:|data:)/.test(value))continue;
    const resolved=new URL(value,company.origin+route.path);
    if(resolved.origin!==company.origin)continue;
    links++;
    const targetFile=filesForRoute(resolved.pathname);
    if(!await exists(targetFile)){failures.push(`${route.path}: missing target ${value}`);continue;}
    if(resolved.hash){
      const target=load(await fs.readFile(targetFile,'utf8'));
      if(!target('[id]').toArray().some(x=>target(x).attr('id')===decodeURIComponent(resolved.hash.slice(1)))) failures.push(`${route.path}: missing anchor ${value}`);
    }
  }
  for(const label of $('label[for]').toArray())if(!$('[id]').toArray().some(el=>$(el).attr('id')===$(label).attr('for')))failures.push(`${route.path}: label without field`);
  const content=$('main').text();
  if(/ISO 9001|ISO 27001|60%|1500\+|10,000|الحوسبة الكمية/.test(content)) failures.push(`${route.path}: unsupported claim`);
}
for(const file of ['index-en.html','robots.txt','sitemap.xml','assets/site.css','assets/site.js','Dockerfile','server/index.mjs'])if(!await exists(path.join(root,file)))failures.push(`missing ${file}`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(`PASS: ${config.routes.length} content pages; ${links} local links/assets; metadata, language equivalents, anchors, CSP-compatible markup and source claims.`);
