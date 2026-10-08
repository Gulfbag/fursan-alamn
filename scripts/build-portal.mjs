import fs from 'node:fs/promises';
import path from 'node:path';
import { icons } from 'lucide';
import { portalSeed } from '../src/platform/seed.mjs';
import { renderPortal } from '../src/platform/template.mjs';

const root = path.resolve(import.meta.dirname, '..');
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function pascal(name) {
  return name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function icon(name) {
  const nodes = icons[pascal(name)];
  if (!nodes) throw new Error(`Unknown Lucide icon: ${name}`);
  const children = nodes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${esc(value)}"`).join(' ')}></${tag}>`).join('');
  return `<svg class="portal-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${children}</svg>`;
}

async function write(relative, content) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  return target;
}

const [domainSource, seedSource] = await Promise.all([
  fs.readFile(path.join(root, 'src/platform/domain.mjs'), 'utf8'),
  fs.readFile(path.join(root, 'src/platform/seed.mjs'), 'utf8'),
]);
const generated = await Promise.all([
  write('assets/platform-domain.mjs', domainSource),
  write('assets/platform-seed.mjs', seedSource),
  write('platform.html', renderPortal({ lang: 'ar', seed: portalSeed, icon })),
  write('en/platform.html', renderPortal({ lang: 'en', seed: portalSeed, icon })),
]);

for (const filename of generated) console.log(`Built ${path.relative(root, filename)}`);

const manifestPath=path.join(root,'manus-routes.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
manifest.routes=manifest.routes.filter(route=>!['/platform.html','/en/platform.html'].includes(route.path));
manifest.routes.push({path:'/platform.html',title:'بوابة التشغيل التجريبية',kind:'demo'},{path:'/en/platform.html',title:'Demo operations portal',kind:'demo'});
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
