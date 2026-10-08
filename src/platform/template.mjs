const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const copy = {
  ar: {
    dir: 'rtl', locale: 'ar', title: 'بوابة التشغيل التجريبية', siteName: 'فرسان الأمن للحماية', back: 'العودة إلى الموقع', language: 'English', languageLabel: 'عرض البوابة باللغة الإنجليزية', skip: 'تجاوز إلى محتوى البوابة', demo: 'بيئة عرض تجريبية — بيانات افتراضية؛ ليست منصة تشغيل أو مصادقة فعلية', roleLabel: 'استعراض الدور التجريبي', roleHint: 'التصفية هنا للعرض فقط وليست صلاحيات حقيقية.', navLabel: 'تنقل البوابة', mobileNav: 'تنقل سريع', search: 'ابحث في البلاغات التجريبية', filter: 'كل الحالات', heading: 'لوحة العمليات التجريبية', subheading: 'نظرة تشغيلية مقيدة بالعرض، مع مراجعة بشرية لكل إجراء حساس.', close: 'إغلاق', dialogTitle: 'إنشاء بلاغ تجريبي', incidentTitle: 'عنوان البلاغ', incidentDetail: 'وصف مختصر غير شخصي', incidentService: 'خدمة', incidentSite: 'الموقع المعيّن', serviceDate: 'تاريخ الخدمة الثابت', noPii: 'لا تدخل أسماء أو أرقام اتصال أو أي بيانات شخصية أو حساسة.', cancel: 'إلغاء', create: 'إنشاء البلاغ في الذاكرة', live: 'حالة البوابة', nav: [['overview', 'نظرة عامة'], ['incidents', 'البلاغات'], ['shifts', 'الورديات'], ['reports', 'التقارير'], ['assistant', 'المساعد'], ['integrations', 'جاهزية الربط']],
  },
  en: {
    dir: 'ltr', locale: 'en', title: 'Demo Operations Portal', siteName: 'Fursan Al-Amn Security Company', back: 'Back to website', language: 'العربية', languageLabel: 'View portal in Arabic', skip: 'Skip to portal content', demo: 'Demo environment — fictional data; not an operational platform or real authentication.', roleLabel: 'Demo role view', roleHint: 'This display filter is not real authorization.', navLabel: 'Portal navigation', mobileNav: 'Quick navigation', search: 'Search demo incidents', filter: 'All statuses', heading: 'Demo operations dashboard', subheading: 'A display-only operating view with human review for every sensitive action.', close: 'Close', dialogTitle: 'Create demo incident', incidentTitle: 'Incident title', incidentDetail: 'Short non-personal description', incidentService: 'Service', incidentSite: 'Assigned site', serviceDate: 'Fixed service date', noPii: 'Do not enter names, contact details, or any personal or sensitive information.', cancel: 'Cancel', create: 'Create incident in memory', live: 'Portal status', nav: [['overview', 'Overview'], ['incidents', 'Incidents'], ['shifts', 'Shifts'], ['reports', 'Reports'], ['assistant', 'Assistant'], ['integrations', 'Integration readiness']],
  },
};

export function renderPortal({ lang, seed, icon }) {
  const t = copy[lang];
  const other = lang === 'ar' ? 'en' : 'ar';
  const portalPath = lang === 'ar' ? '/platform.html' : '/en/platform.html';
  const otherPortalPath = other === 'ar' ? '/platform.html' : '/en/platform.html';
  const homePath = lang === 'ar' ? '/' : '/en/';
  const nav = t.nav.map(([id, label], index) => `<button type="button" class="portal-nav-link${index === 0 ? ' is-active' : ''}" data-section="${id}" aria-current="${index === 0 ? 'page' : 'false'}">${icon(index === 0 ? 'layout-dashboard' : id === 'incidents' ? 'siren' : id === 'shifts' ? 'clipboard-check' : id === 'reports' ? 'file-text' : id === 'assistant' ? 'bot' : 'plug-zap')}<span>${esc(label)}</span></button>`).join('');
  const mobile = t.nav.map(([id, label], index) => `<button type="button" data-section="${id}" class="portal-mobile-link${index === 0 ? ' is-active' : ''}" aria-current="${index === 0 ? 'page' : 'false'}">${icon(index === 0 ? 'layout-dashboard' : id === 'incidents' ? 'siren' : id === 'shifts' ? 'clipboard-check' : id === 'reports' ? 'file-text' : id === 'assistant' ? 'bot' : 'plug-zap')}<span>${esc(label)}</span></button>`).join('');
  const roles = [['operations', lang === 'ar' ? 'العمليات — جميع مواقع العرض' : 'Operations — all demo sites'], ['supervisor', lang === 'ar' ? 'المشرف — الموقع التجريبي أ' : 'Supervisor — Demo Site A'], ['guard', lang === 'ar' ? 'الحارس — الموقع التجريبي أ' : 'Guard — Demo Site A'], ['client', lang === 'ar' ? 'العميل — العقد C01 فقط' : 'Client — contract C01 only']].map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('');
  const sites = seed.sites.map((site) => `<option value="${site.id}">${esc(site.name[lang])} — ${site.id}</option>`).join('');
  const services = [['guarding', lang === 'ar' ? 'حراسة ميدانية' : 'Field guarding'], ['operations', lang === 'ar' ? 'متابعة تشغيلية' : 'Operations follow-up'], ['video-review', lang === 'ar' ? 'مراجعة فيديو بشرية' : 'Human video review']].map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('');
  return `<!doctype html>
<html lang="${t.locale}" dir="${t.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0D1E2A">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="description" content="${esc(t.demo)}">
  <title>${esc(t.title)} | ${esc(t.siteName)}</title>
  <link rel="icon" href="/assets/images/logo.webp" type="image/webp">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/platform.css">
  <link rel="preload" href="/assets/fonts/noto-arabic-regular.woff2" as="font" type="font/woff2" crossorigin>
  <script type="module" src="/assets/platform.js"></script>
</head>
<body class="platform-body">
  <a class="portal-skip-link" href="#portal-main">${esc(t.skip)}</a>
  <header class="portal-header">
    <a href="${homePath}" class="portal-brand" aria-label="${esc(t.back)}">
      <img src="/assets/images/logo.webp" width="48" height="48" alt="${lang === 'ar' ? 'شعار فرسان الأمن' : 'Fursan Al Amn logo'}">
      <span><strong>${esc(t.siteName)}</strong><small>${lang === 'ar' ? 'البوابة الرقمية' : 'Digital platform'}</small></span>
    </a>
    <div class="portal-header-actions">
      <a class="portal-text-link" href="${otherPortalPath}" lang="${other}" hreflang="${other}" aria-label="${esc(t.languageLabel)}">${esc(t.language)}</a>
      <a class="portal-back-link" href="${homePath}" aria-label="${esc(t.back)}">${icon('arrow-left')}<span>${esc(t.back)}</span></a>
    </div>
  </header>
  <div class="portal-demo-banner" role="note">${icon('shield-alert')}<p>${esc(t.demo)}</p></div>
  <div class="portal-shell">
    <aside class="portal-sidebar" aria-label="${esc(t.navLabel)}">
      <nav class="portal-nav">${nav}</nav>
      <div class="portal-side-note"><strong>${lang === 'ar' ? 'حدود العرض' : 'Demo boundary'}</strong><p>${lang === 'ar' ? 'لا مصادقة، لا اتصال بيانات، ولا حفظ بعد إعادة التحميل.' : 'No authentication, no data connection, and no persistence after reload.'}</p></div>
    </aside>
    <main id="portal-main" class="portal-main" tabindex="-1">
      <div class="portal-title-row">
        <div><p class="portal-eyebrow">${lang === 'ar' ? 'منصة فرسان الأمن الذكية' : 'Fursan smart platform'}</p><h1>${esc(t.heading)}</h1><p>${esc(t.subheading)}</p></div>
        <span class="portal-memory-chip">${icon('database-zap')}<span>${lang === 'ar' ? 'ذاكرة جلسة فقط' : 'Session memory only'}</span></span>
      </div>
      <div class="portal-role-control">
        <label for="role-select">${esc(t.roleLabel)}</label>
        <select id="role-select" name="demo-role" aria-describedby="role-hint">${roles}</select>
        <p id="role-hint">${esc(t.roleHint)}</p>
      </div>
      <section class="portal-toolbar" aria-label="${lang === 'ar' ? 'أدوات العرض' : 'Display tools'}">
        <label class="portal-search"><span class="screen-reader-text">${esc(t.search)}</span>${icon('search')}<input id="portal-search" type="search" autocomplete="off" placeholder="${esc(t.search)}"></label>
        <label class="portal-filter"><span class="screen-reader-text">${lang === 'ar' ? 'تصفية حالة البلاغ' : 'Filter incident status'}</span><select id="status-filter"><option value="all">${esc(t.filter)}</option><option value="new">new</option><option value="triaged">triaged</option><option value="assigned">assigned</option><option value="resolved">resolved</option><option value="closed">closed</option></select></label>
      </section>
      <p id="portal-live" class="screen-reader-text" aria-live="polite">${esc(t.live)}</p>
      <section id="portal-content" class="portal-content" aria-live="polite" aria-busy="true"></section>
    </main>
  </div>
  <nav class="portal-mobile-nav" aria-label="${esc(t.mobileNav)}">${mobile}</nav>
  <dialog id="incident-dialog" class="portal-dialog" aria-labelledby="incident-dialog-title">
    <form id="incident-form" method="dialog" novalidate>
      <div class="portal-dialog-heading"><div><p class="portal-eyebrow">${lang === 'ar' ? 'إجراء محكوم بالعرض' : 'Demo-governed action'}</p><h2 id="incident-dialog-title">${esc(t.dialogTitle)}</h2></div><button type="button" class="portal-icon-button" data-action="close-dialog" aria-label="${esc(t.close)}">${icon('x')}</button></div>
      <p class="portal-form-note">${esc(t.noPii)}</p>
      <div class="portal-form-grid"><label>${esc(t.incidentTitle)}<input id="incident-title" name="incident-title" required minlength="4" maxlength="140" autocomplete="off"></label><label>${esc(t.incidentService)}<select id="incident-service" name="incident-service">${services}</select></label><label>${esc(t.incidentSite)}<select id="incident-site" name="incident-site">${sites}</select></label><label>${esc(t.serviceDate)}<output class="portal-fixed-date">2026-10-08</output></label></div>
      <label>${esc(t.incidentDetail)}<textarea id="incident-detail" name="incident-detail" maxlength="280" rows="4"></textarea></label>
      <p id="incident-error" class="portal-form-error" role="alert" hidden></p>
      <div class="portal-dialog-actions"><button type="button" class="portal-secondary-button" data-action="close-dialog">${esc(t.cancel)}</button><button type="submit" class="portal-primary-button">${icon('plus')}<span>${esc(t.create)}</span></button></div>
    </form>
  </dialog>
</body>
</html>`;
}
