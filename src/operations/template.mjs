const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const copy = {
  ar: {
    dir: 'rtl', locale: 'ar', pageTitle: 'إدارة العمليات الرقمية', siteName: 'فرسان الأمن للحماية',
    description: 'واجهة إدارة عمليات داخلية بلا ورق على بيئة Staging. تتطلب هوية وصلاحيات API خادمية.',
    home: 'الموقع الرئيسي', language: 'English', languageLabel: 'عرض إدارة العمليات باللغة الإنجليزية',
    skip: 'تجاوز إلى محتوى إدارة العمليات', menu: 'فتح قائمة الأقسام', closeMenu: 'إغلاق قائمة الأقسام',
    product: 'إدارة العمليات', environment: 'Staging', environmentNote: 'بيئة اختبار داخلية؛ لا تعتبر خدمة إنتاجية أو توقيعاً قانونياً.',
    navLabel: 'أقسام إدارة العمليات', dashboard: 'الجاهزية', requests: 'الطلبات', clients: 'العملاء', tasks: 'المهام', documents: 'ملفات العمل', assistant: 'المساعد',
    heading: 'إدارة عمل بلا ورق', subheading: 'طلبات وعملاء ومهام وملفات عمل رقمية بمراجعة بشرية وصلاحيات خادمية.',
    connection: 'يتم التحقق من حالة النظام والصلاحيات…', toolbarLabel: 'أدوات القائمة', search: 'بحث في السجل الحالي', filter: 'تصفية الحالة', allStatuses: 'كل الحالات',
    live: 'حالة واجهة إدارة العمليات', content: 'يتم تحميل واجهة إدارة العمليات…',
    dialogTitle: 'سجل جديد', close: 'إغلاق', cancel: 'إلغاء', save: 'حفظ عبر الخادم',
    legal: 'الاعتماد الرقمي داخلي لمراجعة العمل فقط، وليس توقيعاً قانونياً أو إرسالاً تلقائياً.',
    static: 'هذه معاينة ثابتة فقط؛ النظام غير مفعّل على GitHub Pages ولا يمكن حفظ أي تغيير دون API محمي.',
  },
  en: {
    dir: 'ltr', locale: 'en', pageTitle: 'Digital Operations Management', siteName: 'Fursan Al-Amn Security Company',
    description: 'A paperless internal operations interface on Staging. It requires server-side API identity and permissions.',
    home: 'Main website', language: 'العربية', languageLabel: 'View operations management in Arabic',
    skip: 'Skip to operations content', menu: 'Open section menu', closeMenu: 'Close section menu',
    product: 'Operations management', environment: 'Staging', environmentNote: 'Internal test environment; not a production service or legal signature.',
    navLabel: 'Operations management sections', dashboard: 'Readiness', requests: 'Requests', clients: 'Clients', tasks: 'Tasks', documents: 'Work files', assistant: 'Assistant',
    heading: 'Paperless work management', subheading: 'Requests, clients, tasks, and digital work files with human review and server-side permissions.',
    connection: 'Checking system state and permissions…', toolbarLabel: 'List tools', search: 'Search current records', filter: 'Filter status', allStatuses: 'All statuses',
    live: 'Operations management status', content: 'Loading operations management…',
    dialogTitle: 'New record', close: 'Close', cancel: 'Cancel', save: 'Save through server',
    legal: 'Digital approval is internal work review only; it is not a legal signature or automatic sending.',
    static: 'This is a static preview only. Operations are not enabled on GitHub Pages and no change can be saved without a protected API.',
  },
};

export function renderOperationsPage(locale = 'ar') {
  const lang = locale === 'en' ? 'en' : 'ar';
  const t = copy[lang];
  const other = lang === 'ar' ? 'en' : 'ar';
  const homePath = lang === 'ar' ? '/' : '/en/';
  const operationsPath = lang === 'ar' ? '/operations.html' : '/en/operations.html';
  const otherPath = other === 'ar' ? '/operations.html' : '/en/operations.html';
  const navigation = [
    ['dashboard', t.dashboard], ['requests', t.requests], ['clients', t.clients], ['tasks', t.tasks], ['documents', t.documents], ['assistant', t.assistant],
  ].map(([section, label], index) => `<button type="button" class="ops-nav-link${index === 0 ? ' is-active' : ''}" data-section="${section}" aria-current="${index === 0 ? 'page' : 'false'}"><span>${escapeHtml(label)}</span></button>`).join('');

  return `<!doctype html>
<html lang="${t.locale}" dir="${t.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0D1E2A">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="description" content="${escapeHtml(t.description)}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; form-action 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'self'">
  <link rel="canonical" href="${operationsPath}">
  <link rel="icon" href="/assets/images/emblem.webp" type="image/webp">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/operations.css">
  <link rel="preload" href="/assets/fonts/noto-arabic-regular.woff2" as="font" type="font/woff2" crossorigin>
  <script type="module" src="/assets/operations.js"></script>
  <title>${escapeHtml(t.pageTitle)} | ${escapeHtml(t.siteName)}</title>
</head>
<body class="ops-body" data-locale="${t.locale}">
  <a class="ops-skip-link" href="#ops-main">${escapeHtml(t.skip)}</a>
  <header class="ops-header">
    <a class="ops-brand" href="${homePath}" aria-label="${escapeHtml(t.home)}">
      <img src="/assets/images/emblem.webp" width="48" height="48" alt="${lang === 'ar' ? 'شعار فرسان الأمن' : 'Fursan Al-Amn emblem'}">
      <span><strong>${escapeHtml(t.siteName)}</strong><small>${escapeHtml(t.product)}</small></span>
    </a>
    <div class="ops-header-actions">
      <span class="ops-environment" aria-label="${escapeHtml(t.environment)}">${escapeHtml(t.environment)}</span>
      <a class="ops-language" href="${otherPath}" lang="${other}" hreflang="${other}" aria-label="${escapeHtml(t.languageLabel)}">${escapeHtml(t.language)}</a>
      <button class="ops-menu-button" type="button" aria-expanded="false" aria-controls="ops-sidebar" aria-label="${escapeHtml(t.menu)}" data-action="toggle-menu"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span></button>
    </div>
  </header>
  <div class="ops-stage-note" role="note"><strong>${escapeHtml(t.environment)}.</strong> ${escapeHtml(t.environmentNote)}</div>
  <div class="ops-app">
    <aside id="ops-sidebar" class="ops-sidebar" aria-label="${escapeHtml(t.navLabel)}" aria-hidden="false">
      <div class="ops-sidebar-heading"><p>${escapeHtml(t.product)}</p><button class="ops-sidebar-close" type="button" data-action="close-menu" aria-label="${escapeHtml(t.closeMenu)}">×</button></div>
      <nav class="ops-navigation">${navigation}</nav>
      <div class="ops-sidebar-boundary"><strong>${escapeHtml(t.environment)}</strong><p>${escapeHtml(t.legal)}</p></div>
    </aside>
    <div class="ops-overlay" data-action="close-menu" hidden></div>
    <main id="ops-main" class="ops-main" tabindex="-1">
      <header class="ops-page-heading">
        <div><p class="ops-eyebrow">${escapeHtml(t.environment)} · ${escapeHtml(t.product)}</p><h1>${escapeHtml(t.heading)}</h1><p>${escapeHtml(t.subheading)}</p></div>
        <p id="ops-connection" class="ops-connection" role="status">${escapeHtml(t.connection)}</p>
      </header>
      <section class="ops-toolbar" aria-label="${escapeHtml(t.toolbarLabel)}">
        <label class="ops-search"><span class="ops-sr-only">${escapeHtml(t.search)}</span><input id="ops-search" type="search" autocomplete="off" placeholder="${escapeHtml(t.search)}"></label>
        <label class="ops-filter"><span class="ops-sr-only">${escapeHtml(t.filter)}</span><select id="ops-status-filter"><option value="">${escapeHtml(t.allStatuses)}</option></select></label>
        <span id="ops-toolbar-action"></span>
      </section>
      <p id="ops-live" class="ops-sr-only" aria-live="polite">${escapeHtml(t.live)}</p>
      <section id="ops-content" class="ops-content" aria-live="polite" aria-busy="true"><div class="ops-state ops-state-loading"><h2>${escapeHtml(t.content)}</h2></div></section>
    </main>
  </div>
  <dialog id="ops-dialog" class="ops-dialog" aria-labelledby="ops-dialog-title">
    <form id="ops-form" method="dialog" novalidate>
      <div class="ops-dialog-heading"><div><p class="ops-eyebrow">${escapeHtml(t.product)}</p><h2 id="ops-dialog-title">${escapeHtml(t.dialogTitle)}</h2></div><button class="ops-icon-button" type="button" data-action="close-dialog" aria-label="${escapeHtml(t.close)}">×</button></div>
      <div id="ops-dialog-body"></div>
      <p id="ops-form-error" class="ops-form-error" role="alert" hidden></p>
      <div class="ops-dialog-actions"><button type="button" class="ops-button ops-button-secondary" data-action="close-dialog">${escapeHtml(t.cancel)}</button><button id="ops-submit" type="submit" class="ops-button ops-button-primary">${escapeHtml(t.save)}</button></div>
    </form>
  </dialog>
</body>
</html>`;
}
