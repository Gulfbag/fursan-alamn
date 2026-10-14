import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const FORBIDDEN_TOP_LEVEL = new Set(['.git', 'src', 'server', 'docs', 'node_modules']);
const MIME_TYPES = Object.freeze({
  '.avif': 'image/avif', '.css': 'text/css; charset=utf-8', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8',
});

export function cspForHtml(html = '') {
  const hashes = new Set();
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = scriptPattern.exec(html)) !== null) {
    if (/\bsrc\s*=/i.test(match[1])) continue;
    hashes.add(`'sha256-${createHash('sha256').update(match[2], 'utf8').digest('base64')}'`);
  }
  const inlineScriptHashes = [...hashes].join(' ');
  return [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
    "form-action 'self'", "connect-src 'self'", "img-src 'self' data:", "font-src 'self'",
    "style-src 'self'", `script-src 'self'${inlineScriptHashes ? ` ${inlineScriptHashes}` : ''}`,
    "media-src 'self'", "worker-src 'self'",
  ].join('; ');
}

export function setSecurityHeaders(response, html = '', appEnv = 'production') {
  response.setHeader('Content-Security-Policy', cspForHtml(html));
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  if (appEnv === 'staging') response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

export function sendJson(response, statusCode, payload, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

export function sendNotFound(response) {
  response.statusCode = 404;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end('Not Found');
}

export function staticRelativePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\u0000')) return null;
  const segments = decoded.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) return null;
  if (segments[0] && FORBIDDEN_TOP_LEVEL.has(segments[0])) return null;
  if (decoded === '/') return 'index.html';
  if (decoded === '/robots.txt' || decoded === '/sitemap.xml') return decoded.slice(1);
  if (decoded.startsWith('/assets/') && segments.length > 1) return segments.join('/');
  if (decoded.endsWith('.html')) return segments.join('/');
  if (!path.posix.extname(decoded) && segments.length > 0) return path.posix.join(...segments, 'index.html');
  return null;
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function cacheControlFor(relativePath) {
  if (relativePath.endsWith('.html')) return 'public, max-age=0, must-revalidate';
  if (relativePath.startsWith('assets/')) {
    const filename = path.posix.basename(relativePath);
    return /(?:^|[._-])[a-f0-9]{8,}(?:[._-]|$)/i.test(filename)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600';
  }
  return 'public, max-age=0, must-revalidate';
}

export async function serveStatic(request, response, staticRoot, {
  appEnv = 'production',
  allowRelativePath = () => true,
} = {}) {
  const url = new URL(request.url, 'http://localhost');
  const relativePath = staticRelativePath(url.pathname);
  if (!relativePath || !allowRelativePath(relativePath)) return sendNotFound(response);
  const candidate = path.resolve(staticRoot, relativePath);
  if (!insideRoot(staticRoot, candidate)) return sendNotFound(response);

  let realPath;
  let details;
  try {
    realPath = await fs.realpath(candidate);
    if (!insideRoot(staticRoot, realPath)) return sendNotFound(response);
    details = await fs.stat(realPath);
  } catch { return sendNotFound(response); }
  if (!details.isFile()) return sendNotFound(response);

  let contents;
  try { contents = await fs.readFile(realPath); } catch { return sendNotFound(response); }
  const extension = path.extname(relativePath).toLowerCase();
  const isHtml = extension === '.html';
  setSecurityHeaders(response, isHtml ? contents.toString('utf8') : '', appEnv);
  response.statusCode = 200;
  response.setHeader('content-type', isHtml ? HTML_CONTENT_TYPE : (MIME_TYPES[extension] || 'application/octet-stream'));
  response.setHeader('cache-control', cacheControlFor(relativePath));
  if (request.method === 'HEAD') return response.end();
  response.end(contents);
}
