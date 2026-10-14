import { createApp } from './app.mjs';

export function isWebsiteStaticPath(relativePath) {
  return !(
    relativePath === 'operations.html'
    || relativePath === 'en/operations.html'
    || relativePath === 'assets/operations.js'
    || relativePath === 'assets/operations.css'
  );
}

/**
 * سطح الموقع التسويقي لا يركب handler العمليات. الحماية هنا دفاع ثانٍ فوق
 * توزيع Docker الذي لا ينسخ ملفات العمليات أصلاً.
 */
export function createWebsiteApp(options = {}) {
  return createApp({ ...options, operationsHandler: undefined, allowStaticPath: isWebsiteStaticPath });
}
