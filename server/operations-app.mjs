import path from 'node:path';
import { sendJson, sendNotFound, serveStatic, setSecurityHeaders } from './http-static.mjs';

const OPERATIONS_FILES = new Set([
  'operations.html',
  'en/operations.html',
  'robots.txt',
  'assets/operations.css',
  'assets/operations.js',
  'assets/images/emblem.webp',
]);

export function isOperationsStaticPath(relativePath) {
  return OPERATIONS_FILES.has(relativePath)
    || /^assets\/fonts\/[a-z0-9-]+\.(?:woff2|txt)$/i.test(relativePath);
}

/**
 * واجهة operations لا ترث `/` أو `/api/leads` أو أي صفحة تسويقية. لا تضيف
 * CORS أو cookies؛ تعتمد المصادقة الموقعة IAP في handler العمليات فقط.
 */
export function createOperationsApp({ config, operationsHandler, staticRoot = process.cwd() } = {}) {
  if (!config) throw new TypeError('operations config is required');
  if (typeof operationsHandler !== 'function') throw new TypeError('operations handler is required');
  const resolvedStaticRoot = path.resolve(staticRoot);

  return async function operationsApp(request, response) {
    setSecurityHeaders(response, '', config.appEnv);
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    const url = new URL(request.url, 'http://localhost');

    if (await operationsHandler(request, response)) return;
    if (request.method === 'GET' && url.pathname === '/healthz') return sendJson(response, 200, { status: 'ok' });
    if (request.method === 'GET' || request.method === 'HEAD') {
      return serveStatic(request, response, resolvedStaticRoot, {
        appEnv: config.appEnv,
        allowRelativePath: isOperationsStaticPath,
      });
    }
    return sendNotFound(response);
  };
}
