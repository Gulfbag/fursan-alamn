import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.env.FURSAN_RUNTIME_DIST_DIR || path.join(root, 'dist', 'runtime'));
const rootFiles = ['robots.txt', 'sitemap.xml'];
const contentDirectories = ['ar', 'en', 'services', 'articles'];

async function exists(source) {
  try { return (await fs.stat(source)).isFile(); } catch { return false; }
}

async function copyFile(relativePath, destination) {
  const source = path.join(root, relativePath);
  if (!await exists(source)) return;
  const target = path.join(destination, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyDirectory(relativePath, destination, filter = () => true) {
  const source = path.join(root, relativePath);
  try { await fs.access(source); } catch { return; }
  await fs.cp(source, path.join(destination, relativePath), {
    recursive: true,
    filter: (candidate) => filter(path.relative(source, candidate).split(path.sep).join('/')),
  });
}

async function copyRootHtml(destination, filter = () => true) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html') && filter(entry.name))
    .map((entry) => copyFile(entry.name, destination)));
}

async function writeOperationsRobots(destination) {
  await fs.writeFile(path.join(destination, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
}

async function prepareWebsite(destination) {
  await copyRootHtml(destination, (name) => name !== 'operations.html');
  await Promise.all(rootFiles.map((file) => copyFile(file, destination)));
  await Promise.all(contentDirectories.map((directory) => copyDirectory(directory, destination, (relative) => (
    !(directory === 'en' && relative === 'operations.html')
  ))));
  await copyDirectory('assets', destination, (relative) => !['operations.css', 'operations.js'].includes(relative));
}

async function prepareOperations(destination) {
  await Promise.all([
    copyFile('operations.html', destination),
    copyFile('en/operations.html', destination),
    copyFile('assets/operations.css', destination),
    copyFile('assets/operations.js', destination),
    copyFile('assets/images/emblem.webp', destination),
  ]);
  await copyDirectory('assets/fonts', destination);
  await writeOperationsRobots(destination);
}

async function prepareCombined(destination) {
  await copyRootHtml(destination);
  await Promise.all(rootFiles.map((file) => copyFile(file, destination)));
  await Promise.all(contentDirectories.map((directory) => copyDirectory(directory, destination)));
  await copyDirectory('assets', destination);
}

async function assertAbsent(destination, forbiddenPaths) {
  for (const relativePath of forbiddenPaths) {
    try {
      await fs.access(path.join(destination, relativePath));
      throw new Error(`runtime distribution unexpectedly contains ${relativePath}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

await fs.rm(output, { recursive: true, force: true });
await Promise.all([
  prepareWebsite(path.join(output, 'website')),
  prepareOperations(path.join(output, 'operations')),
  prepareCombined(path.join(output, 'combined')),
]);
await assertAbsent(path.join(output, 'website'), [
  'operations.html', 'en/operations.html', 'assets/operations.js', 'assets/operations.css',
]);
await assertAbsent(path.join(output, 'operations'), [
  'index.html', 'en/index.html', 'assets/site.css', 'assets/site.js', 'assets/platform.js',
]);
console.log(`Prepared isolated runtime distributions in ${output}`);
