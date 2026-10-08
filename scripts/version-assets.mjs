import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manus-routes.json'),'utf8'));
const names=['site.css','site.js','platform.css','platform.js','operations.css','operations.js'];
const versions=new Map();
for(const name of names){const bytes=await fs.readFile(path.join(root,'assets',name));versions.set('/assets/'+name,createHash('sha256').update(bytes).digest('hex').slice(0,12));}
const files=new Set(['404.html',...manifest.routes.map(route=>{const relative=route.path.replace(/^\//,'');return !relative||relative.endsWith('/')?relative+'index.html':relative;})]);
for(const file of files){
 const destination=path.join(root,file);const html=await fs.readFile(destination,'utf8');
 const versioned=html.replace(/(href|src)="(\/assets\/(?:site\.css|site\.js|platform\.css|platform\.js|operations\.css|operations\.js))(?:\?[^"\s]*)?"/g,(_,attribute,asset)=>`${attribute}="${asset}?v=${versions.get(asset)}"`);
 await fs.writeFile(destination,versioned.replace(/^[\t ]+$/gm,''));
}
console.log(`Versioned local assets in ${files.size} public HTML files.`);
