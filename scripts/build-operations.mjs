import fs from 'node:fs/promises';
import path from 'node:path';
import { renderOperationsPage } from '../src/operations/template.mjs';

const root = path.resolve(import.meta.dirname, '..');

async function write(relativePath, content) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
  console.log(`Built ${path.relative(root, target)}`);
}

await Promise.all([
  write('operations.html', renderOperationsPage('ar')),
  write('en/operations.html', renderOperationsPage('en')),
]);

const manifestPath = path.join(root, 'manus-routes.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
manifest.routes = manifest.routes.filter(route => !['/operations.html','/en/operations.html'].includes(route.path));
manifest.routes.push({path:'/operations.html',kind:'operations'},{path:'/en/operations.html',kind:'operations'});
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2)+'\n');
