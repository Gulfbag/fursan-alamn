/* API-only client for the paperless operations core. It never stores business data or permissions in localStorage. */
(() => {
  'use strict';

  const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const text = {
    ar: {
      readiness: 'جاهزية النظام', noCounts: 'لا توجد أرقام تشغيلية معروضة. تظهر القوائم الفعلية فقط بعد نجاح API.', apiReady: 'API متاح', apiDisabled: 'النظام غير مفعّل', signedOut: 'يلزم تسجيل الدخول عبر الهوية المؤسسية للوصول إلى سجلات التشغيل.', forbidden: 'لا تملك صلاحية الوصول إلى هذه البيانات أو الإجراءات.', offline: 'لا يمكن الاتصال بالخدمة حالياً. لم يتم حفظ أي تغيير.', apiError: 'تعذر تحميل البيانات من خدمة العمليات.', static: 'معاينة ثابتة فقط', loading: 'جارٍ تحميل السجل…', empty: 'لا توجد سجلات بعد. ابدأ بسجل جديد عندما يمنحك الخادم الصلاحية.', retry: 'إعادة المحاولة', create: 'إضافة سجل', loadMore: 'تحميل المزيد', request: 'طلب', client: 'عميل', task: 'مهمة', document: 'ملف عمل', details: 'التفاصيل', select: 'اختر سجلاً من القائمة لمراجعته.', status: 'الحالة', priority: 'الأولوية', created: 'تاريخ الإنشاء', updated: 'آخر تحديث', edit: 'تحرير', transition: 'تغيير الحالة', history: 'سجل المراجعات', export: 'تصدير Markdown', approve: 'اعتماد داخلي', revise: 'إنشاء مراجعة جديدة', conflict: 'تم تغيير السجل من مستخدم آخر. تم تحديث القائمة؛ راجع السجل قبل المحاولة مجدداً.', saved: 'تم الحفظ عبر الخادم وتحديث القائمة.', saveFailed: 'لم يتم الحفظ. ', refresh: 'تحديث', dashboardHelp: 'تبدأ بيئة Staging فارغة ولا تستخدم بيانات عرض أو إحصاءات مختلقة.', listAvailable: 'القائمة متاحة من API', recordsShown: 'سجلات معروضة', staticPreview: 'هذه معاينة ثابتة فقط؛ النظام غير مفعّل على GitHub Pages ولا يمكن حفظ أي تغيير دون API محمي.', disabledCopy: 'تم إيقاف النظام خادمياً. لا تُعرض بيانات ولا تُنفذ أي عملية حفظ.', accessCopy: 'الواجهة لا تثق بدور محلي؛ الصلاحيات تأتي من /api/ops/me بعد IAP.', connectionReady: 'متصل بخدمة Staging', connectionDisabled: 'الخدمة غير مفعّلة', connectionOffline: 'غير متصل', connectionPermission: 'يلزم تسجيل الدخول', connectionError: 'تعذر الوصول للخدمة', statusFilter: 'تصفية الحالة', allStatuses: 'كل الحالات', requests: 'الطلبات', clients: 'العملاء', tasks: 'المهام', documents: 'ملفات العمل', assistant: 'المساعد', aiTitle: 'مساعدة تشغيلية بمراجعة بشرية', aiLocal: 'مساعد إجراءات محلي', aiLocalCopy: 'هذا المساعد ليس نموذجاً لغوياً فعلياً. يُنشئ الخادم مسودة إجرائية قابلة للمراجعة ولا ينفذ أو يرسل أي إجراء.', aiVertex: 'Vertex AI قيد الحوكمة', aiVertexCopy: 'لا ترسل أي بيانات شخصية. يلزم اعتماد صريح للتصنيف غير الحساس وللإصدار الحالي قبل طلب مسودة من Vertex.', aiNoRequest: 'اختر طلباً محملاً من API أولاً. لا توجد بيانات عرض للاختيار.', aiPurpose: 'الغرض من المسودة', summary: 'ملخص', actionPlan: 'خطة إجراء', correspondence: 'مراسلة', aiDraft: 'إنشاء مسودة للمراجعة', aiApprove: 'اعتماد تصنيف غير حساس للإصدار الحالي', aiNeedsApproval: 'يلزم اعتماد الإصدار الحالي قبل طلب المسودة.', aiDraftLabel: 'ناتج AI هو مسودة فقط', sourceRefs: 'المصادر', copyToDoc: 'نسخ الاقتراح إلى مسودة ملف', copyNote: 'لا يتم اعتماد أو إرسال أو حفظ المستند إلا بعد الحفظ الصريح عبر الخادم.', legal: 'الاعتماد الرقمي داخلي لمراجعة العمل فقط، وليس توقيعاً قانونياً.', historyEmpty: 'لا توجد مراجعات ظاهرة لهذا الملف.', historyLoad: 'جارٍ تحميل سجل المراجعات…', reportExport: 'تصدير تقرير JSON', reportSaved: 'تم تنزيل التقرير من الخادم.', formNew: 'سجل جديد', formEdit: 'تحرير سجل', formRevise: 'مراجعة ملف معتمد', formWarning: 'لا يظهر نجاح للحفظ حتى يستجيب الخادم. يمنع الخادم الحقول غير المصرح بها ويحدد المعرف والإصدار والحالة والتواريخ.', required: 'حقل مطلوب', close: 'إغلاق', cancel: 'إلغاء', save: 'حفظ عبر الخادم', next: 'التالي', noAssignee: 'لا يوجد مسؤولون متاحون من الخادم', noLinks: 'لا توجد سجلات محملة للاختيار', approveConfirm: 'هل تعتمد هذا الملف داخلياً؟ هذا ليس توقيعاً قانونياً.', transitionTitle: 'تغيير الحالة', server: 'الخادم', persistence: 'الحفظ', mode: 'الوضع', user: 'المستخدم', assigned: 'المسند إليه', linkRequest: 'ربط بطلب', linkClient: 'ربط بعميل', content: 'المحتوى', kind: 'النوع', dueDate: 'تاريخ الاستحقاق', description: 'الوصف', title: 'العنوان', companyName: 'اسم الشركة', contactName: 'اسم جهة الاتصال', email: 'البريد الإلكتروني', phone: 'الهاتف', service: 'الخدمة', city: 'المدينة', notes: 'ملاحظات', approvalPending: 'بانتظار اعتماد AI للإصدار الحالي', retrying: 'يُعاد التحقق من العملية عبر مفتاح طلب واحد…', disabledAction: 'هذه العملية غير متاحة دون API مفعّل.',
    },
    en: {
      readiness: 'System readiness', noCounts: 'No operational counts are shown. Real lists appear only after the API succeeds.', apiReady: 'API available', apiDisabled: 'System not enabled', signedOut: 'Sign in through the corporate identity service to access operations records.', forbidden: 'You do not have permission to access these records or actions.', offline: 'The service cannot be reached right now. No change was saved.', apiError: 'The operations service could not load data.', static: 'Static preview only', loading: 'Loading records…', empty: 'There are no records yet. Start a record only when the server grants permission.', retry: 'Retry', create: 'Add record', loadMore: 'Load more', request: 'Request', client: 'Client', task: 'Task', document: 'Work file', details: 'Details', select: 'Select a record from the list to review it.', status: 'Status', priority: 'Priority', created: 'Created', updated: 'Updated', edit: 'Edit', transition: 'Change status', history: 'Revision history', export: 'Export Markdown', approve: 'Approve internally', revise: 'Create new revision', conflict: 'Another user changed this record. The list was refreshed; review it before trying again.', saved: 'Saved through the server and the list was refreshed.', saveFailed: 'Not saved. ', refresh: 'Refresh', dashboardHelp: 'This Staging environment starts empty and uses no demo data or fabricated statistics.', listAvailable: 'List available from API', recordsShown: 'records displayed', staticPreview: 'This is a static preview only. Operations are not enabled on GitHub Pages and no change can be saved without a protected API.', disabledCopy: 'The system is disabled server-side. No data is shown and no save operation is attempted.', accessCopy: 'The UI does not trust a local role; permissions arrive from /api/ops/me after IAP.', connectionReady: 'Connected to Staging service', connectionDisabled: 'Service is not enabled', connectionOffline: 'Offline', connectionPermission: 'Sign-in required', connectionError: 'Service unavailable', statusFilter: 'Filter status', allStatuses: 'All statuses', requests: 'Requests', clients: 'Clients', tasks: 'Tasks', documents: 'Work files', assistant: 'Assistant', aiTitle: 'Human-reviewed operational assistance', aiLocal: 'Local procedure assistant', aiLocalCopy: 'This assistant is not an actual language model. The server creates a reviewable procedure draft and never executes or sends an action.', aiVertex: 'Vertex AI under governance', aiVertexCopy: 'Do not send personal data. Explicit non-sensitive classification approval for the current version is required before requesting a Vertex draft.', aiNoRequest: 'Select a request loaded from the API first. No demo records are used for selection.', aiPurpose: 'Draft purpose', summary: 'Summary', actionPlan: 'Action plan', correspondence: 'Correspondence', aiDraft: 'Create review draft', aiApprove: 'Approve non-sensitive classification for current version', aiNeedsApproval: 'Approve the current version before requesting a draft.', aiDraftLabel: 'AI output is a draft only', sourceRefs: 'Sources', copyToDoc: 'Copy suggestion to a work-file draft', copyNote: 'The document is not approved, sent, or saved until it is explicitly saved through the server.', legal: 'Digital approval is internal work review only; it is not a legal signature.', historyEmpty: 'No revisions are currently visible for this work file.', historyLoad: 'Loading revision history…', reportExport: 'Export JSON report', reportSaved: 'The report was downloaded from the server.', formNew: 'New record', formEdit: 'Edit record', formRevise: 'Revise approved work file', formWarning: 'No save is reported until the server responds. The server rejects unauthorized fields and sets ID, version, status, and timestamps.', required: 'Required field', close: 'Close', cancel: 'Cancel', save: 'Save through server', next: 'Next', noAssignee: 'No server-provided assignees are available', noLinks: 'No loaded records are available to link', approveConfirm: 'Approve this work file internally? This is not a legal signature.', transitionTitle: 'Change status', server: 'Server', persistence: 'Persistence', mode: 'Mode', user: 'User', assigned: 'Assignee', linkRequest: 'Link request', linkClient: 'Link client', content: 'Content', kind: 'Kind', dueDate: 'Due date', description: 'Description', title: 'Title', companyName: 'Company name', contactName: 'Contact name', email: 'Email', phone: 'Phone', service: 'Service', city: 'City', notes: 'Notes', approvalPending: 'AI approval is pending for the current version', retrying: 'Checking the operation again with the same request key…', disabledAction: 'This action is unavailable without an enabled API.',
    },
  }[lang];

  const entityConfig = {
    requests: { label: text.requests, permission: 'requests:write', status: ['new', 'in_review', 'in_progress', 'awaiting_client', 'completed', 'closed'] },
    clients: { label: text.clients, permission: 'clients:write', status: ['active', 'inactive'] },
    tasks: { label: text.tasks, permission: 'tasks:write', status: ['todo', 'in_progress', 'done', 'cancelled'] },
    documents: { label: text.documents, permission: 'documents:write', status: ['draft', 'in_review', 'approved', 'archived'] },
  };
  const refs = {
    body: document.body, content: document.querySelector('#ops-content'), live: document.querySelector('#ops-live'), connection: document.querySelector('#ops-connection'),
    search: document.querySelector('#ops-search'), filter: document.querySelector('#ops-status-filter'), action: document.querySelector('#ops-toolbar-action'),
    dialog: document.querySelector('#ops-dialog'), form: document.querySelector('#ops-form'), dialogTitle: document.querySelector('#ops-dialog-title'), dialogBody: document.querySelector('#ops-dialog-body'), formError: document.querySelector('#ops-form-error'), submit: document.querySelector('#ops-submit'),
  };
  const state = {
    mode: 'booting', config: null, me: null, active: 'dashboard', collections: { requests: [], clients: [], tasks: [], documents: [] },
    list: { requests: { status: 'idle', nextCursor: null }, clients: { status: 'idle', nextCursor: null }, tasks: { status: 'idle', nextCursor: null }, documents: { status: 'idle', nextCursor: null } },
    selected: {}, aiDraft: null, aiApprovals: new Map(), dialogContext: null, lastFocus: null, debounce: null,
  };

  function make(tag, attributes = {}, value) {
    const node = document.createElement(tag);
    for (const [name, attributeValue] of Object.entries(attributes)) {
      if (attributeValue === undefined || attributeValue === null || attributeValue === false) continue;
      if (name === 'class') node.className = attributeValue;
      else if (name === 'text') node.textContent = String(attributeValue);
      else if (name === 'htmlFor') node.htmlFor = attributeValue;
      else if (name.startsWith('data-')) node.setAttribute(name, String(attributeValue));
      else if (name in node) node[name] = attributeValue;
      else node.setAttribute(name, String(attributeValue));
    }
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  }
  function append(parent, ...children) { children.filter(Boolean).forEach((child) => parent.append(child)); return parent; }
  function clear(node) { node.replaceChildren(); return node; }
  function say(message) { refs.live.textContent = message; }
  function labelForStatus(value) { const labels={new:'جديد',in_review:'قيد المراجعة',in_progress:'قيد التنفيذ',awaiting_client:'بانتظار العميل',completed:'مكتمل',closed:'مغلق',active:'نشط',inactive:'غير نشط',todo:'للإنجاز',done:'منجزة',cancelled:'ملغاة',draft:'مسودة',approved:'معتمد داخليًا',archived:'مؤرشف',normal:'عادية',high:'مرتفعة',procedure:'إجراء عمل',service_report:'تقرير خدمة',proposal:'مقترح',correspondence:'مراسلة'}; return lang==='ar'&&labels[value]?labels[value]:String(value || '').replaceAll('_', ' '); }
  function safeStatus(value) { return String(value || 'unknown').replace(/[^a-z0-9_-]/gi, ''); }
  function isGitHubPages() { return /github\.io$/i.test(window.location.hostname || ''); }
  function can(permission) { return state.mode === 'ready' && Array.isArray(state.me?.permissions) && state.me.permissions.includes(permission); }
  function getSelected(entity) { return state.collections[entity].find((item) => item?.id === state.selected[entity]) || null; }
  function getAssignees() { const incoming = state.me?.assignees || state.me?.principal?.allowedAssignees || []; return Array.isArray(incoming) ? incoming.filter((item) => typeof item === 'string') : []; }
  function known(entity) { return state.collections[entity] || []; }
  function responseError(status, body) { const error = new Error((body && body.error) || `HTTP ${status}`); error.status = status; error.body = body || {}; return error; }
  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (window.crypto?.getRandomValues) { const bytes = window.crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128; const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; }
    throw new Error('secure_idempotency_key_unavailable');
  }
  async function parseResponse(response) {
    const type = response.headers?.get?.('content-type') || '';
    const body = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw responseError(response.status, typeof body === 'object' ? body : { error: body });
    return body;
  }
  async function rawRequest(path, options = {}) {
    let response;
    try { response = await window.fetch(path, options); } catch (cause) { const error = new Error('network_error'); error.network = true; error.cause = cause; throw error; }
    return parseResponse(response);
  }
  async function getApi(path) { return rawRequest(path, { headers: { Accept: 'application/json' }, credentials: 'same-origin' }); }
  async function writeApi(path, method, payload) {
    const key = uuid();
    const options = { method, credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Fursan-Intent': 'operations', 'Idempotency-Key': key }, body: JSON.stringify(payload) };
    try { return await rawRequest(path, options); }
    catch (error) {
      if (!error.network) throw error;
      say(text.retrying);
      return rawRequest(path, options);
    }
  }
  function updateConnection(message, tone = '') { refs.connection.textContent = message; refs.connection.className = `ops-connection${tone ? ` is-${tone}` : ''}`; }
  function updateEnvironment() {
    const mode = state.config?.deploymentMode || 'staging';
    document.querySelectorAll('.ops-environment').forEach((node) => { node.textContent = mode === 'staging' ? 'Staging' : mode; });
  }
  function stateCard(kind, title, copy, retry = false) {
    const card = make('div', { class: `ops-state ops-state-${kind}` });
    append(card, make('h2', {}, title), make('p', {}, copy));
    if (retry) { const button = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.retry }); button.addEventListener('click', boot); card.append(button); }
    return card;
  }
  function isBlocked() { return ['static', 'disabled', 'signin', 'forbidden', 'offline', 'error'].includes(state.mode); }
  function renderBlocked() {
    clear(refs.action); clear(refs.content); refs.content.setAttribute('aria-busy', 'false');
    const content = state.mode === 'static' ? [text.static, text.staticPreview] : state.mode === 'disabled' ? [text.apiDisabled, text.disabledCopy] : state.mode === 'signin' ? [text.signedOut, text.accessCopy] : state.mode === 'forbidden' ? [text.forbidden, text.accessCopy] : state.mode === 'offline' ? [text.offline, text.dashboardHelp] : [text.apiError, text.dashboardHelp];
    refs.content.append(stateCard(state.mode === 'signin' || state.mode === 'forbidden' ? 'permission' : state.mode, content[0], content[1], state.mode === 'offline' || state.mode === 'error'));
  }
  function setupFilter(entity) {
    clear(refs.filter); const all = make('option', { value: '', text: text.allStatuses }); refs.filter.append(all);
    const selected=state.list[entity]?.filterStatus||'';
    if (!entityConfig[entity]) { refs.filter.disabled = true; refs.search.disabled = true; return; }
    refs.filter.disabled = false; refs.search.disabled = false;
    for (const status of entityConfig[entity].status) refs.filter.append(make('option', { value: status, text: labelForStatus(status), selected:status===selected }));
  }
  function setNavigation() {
    document.querySelectorAll('[data-section]').forEach((button) => { const current = button.dataset.section === state.active; button.classList.toggle('is-active', current); button.setAttribute('aria-current', current ? 'page' : 'false'); });
  }
  function setToolbar() {
    clear(refs.action); setupFilter(state.active);
    if (entityConfig[state.active] && can(entityConfig[state.active].permission)) {
      const button = make('button', { type: 'button', class: 'ops-button ops-button-primary', text: text.create });
      button.addEventListener('click', () => openDialog(state.active, 'create'));
      refs.action.append(button);
    }
    if (state.active === 'dashboard' && can('reports:export')) {
      const button = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.reportExport });
      button.addEventListener('click', exportReport); refs.action.append(button);
    }
  }
  function createBadge(value) { return make('span', { class: `ops-badge is-${safeStatus(value)}`, text: labelForStatus(value) }); }
  function field(title, value) { const row = make('div'); append(row, make('dt', {}, title), make('dd', {}, value === undefined || value === null || value === '' ? '—' : String(value))); return row; }
  function valuesFor(entity, record) {
    const common = [[text.status, record.status], [text.created, record.createdAt], [text.updated, record.updatedAt]];
    const map = {
      requests: [[text.companyName, record.companyName], [text.contactName, record.contactName], [text.email, record.email], [text.phone, record.phone], [text.service, record.service], [text.city, record.city], [text.priority, record.priority], [text.assigned, record.assigneeEmail], [text.description, record.description], ...common],
      clients: [[text.contactName, record.contactName], [text.email, record.email], [text.phone, record.phone], [text.city, record.city], [text.notes, record.notes], ...common],
      tasks: [[text.description, record.description], [text.linkRequest, record.requestId], [text.linkClient, record.clientId], [text.assigned, record.assigneeEmail], [text.dueDate, record.dueDate], [text.priority, record.priority], ...common],
      documents: [[text.kind, record.kind], [text.linkRequest, record.requestId], [text.linkClient, record.clientId], [text.content, record.content], ...common],
    };
    return map[entity] || [];
  }
  function makeRecord(entity, record) {
    const button = make('button', { type: 'button', class: `ops-record${record.id === state.selected[entity] ? ' is-selected' : ''}` });
    const title = entity === 'clients' ? record.name : record.title;
    const head = make('div', { class: 'ops-record-head' });
    const titlePart = make('div'); append(titlePart, make('p', { class: 'ops-record-id', text: record.id || '—' }), make('h3', {}, title || '—'));
    append(head, titlePart, createBadge(record.status)); button.append(head);
    const meta = make('p', { class: 'ops-record-meta' });
    if (entity === 'requests') meta.textContent = [record.companyName, record.service, record.city].filter(Boolean).join(' · ');
    if (entity === 'clients') meta.textContent = [record.contactName, record.city].filter(Boolean).join(' · ');
    if (entity === 'tasks') meta.textContent = [record.dueDate, record.priority, record.assigneeEmail].filter(Boolean).join(' · ');
    if (entity === 'documents') meta.textContent = [record.kind, record.requestId || record.clientId].filter(Boolean).join(' · ');
    if (meta.textContent) button.append(meta);
    button.addEventListener('click', () => { state.selected[entity] = record.id; render(); });
    return button;
  }
  function detailPanel(entity, record) {
    const panel = make('aside', { class: 'ops-detail-panel', 'aria-label': text.details });
    if (!record) { append(panel, make('h2', {}, text.details), make('p', {}, text.select)); return panel; }
    append(panel, make('p', { class: 'ops-record-id', text: record.id || '—' }), make('h2', {}, entity === 'clients' ? record.name : record.title), createBadge(record.status));
    const list = make('dl', { class: 'ops-detail-list' });
    for (const [title, value] of valuesFor(entity, record)) list.append(field(title, value));
    panel.append(list);
    const actions = make('div', { class: 'ops-detail-actions' });
    if (can(entityConfig[entity].permission)) {
      if (entity === 'documents' && record.status === 'approved') { const revise = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.revise }); revise.addEventListener('click', () => openDialog('documents', 'revise', record)); actions.append(revise); }
      else { const edit = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.edit }); edit.addEventListener('click', () => openDialog(entity, 'edit', record)); actions.append(edit); }
      if (!['closed','cancelled','archived','done'].includes(record.status)) { const move = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.transition }); move.addEventListener('click', () => openTransitionDialog(entity, record)); actions.append(move); }
    }
    if (entity === 'documents') {
      if (can('documents:approve') && record.status === 'in_review') { const approve = make('button', { type: 'button', class: 'ops-button ops-button-primary', text: text.approve }); approve.addEventListener('click', () => approveDocument(record)); actions.append(approve); }
      const history = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.history }); history.addEventListener('click', () => loadHistory(record, panel)); actions.append(history);
      const exportButton = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.export }); exportButton.addEventListener('click', () => exportDocument(record)); actions.append(exportButton);
    }
    if (actions.childElementCount) panel.append(actions);
    return panel;
  }
  function renderEntity(entity) {
    clear(refs.content); refs.content.setAttribute('aria-busy', 'false');
    const config = entityConfig[entity]; const info = state.list[entity];
    const heading = make('header', { class: 'ops-page-section-header' }); append(heading, append(make('div'), make('p', { class: 'ops-eyebrow', text: text.listAvailable }), make('h2', {}, config.label), make('p', {}, text.dashboardHelp)));
    refs.content.append(heading);
    if (info.status === 'loading' || info.status === 'idle') { refs.content.append(stateCard('loading', text.loading, text.noCounts)); return; }
    if (info.status === 'error') { refs.content.append(stateCard('error', text.apiError, info.error || text.apiError, true)); return; }
    const layout = make('div', { class: 'ops-record-layout' }); const listPanel = make('section', { class: 'ops-list-panel' });
    const records = known(entity);
    if (!records.length) listPanel.append(make('div', { class: 'ops-empty-inline', text: text.empty }));
    else { const list = make('div', { class: 'ops-list' }); records.forEach((record) => list.append(makeRecord(entity, record))); listPanel.append(list); if (info.nextCursor) { const more = make('div', { class: 'ops-pagination' }); const button = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.loadMore }); button.addEventListener('click', () => loadList(entity, true)); more.append(button); listPanel.append(more); } }
    append(layout, listPanel, detailPanel(entity, getSelected(entity))); refs.content.append(layout);
  }
  function renderDashboard() {
    clear(refs.content); refs.content.setAttribute('aria-busy', 'false');
    const header = make('header', { class: 'ops-page-section-header' }); append(header, append(make('div'), make('p', { class: 'ops-eyebrow', text: state.config?.deploymentMode || 'staging' }), make('h2', {}, text.readiness), make('p', {}, text.dashboardHelp)));
    refs.content.append(header);
    const grid = make('div', { class: 'ops-dashboard-grid' });
    const cards = [[text.mode, state.config?.deploymentMode || '—', text.server], [text.persistence, state.config?.persistence || '—', text.apiReady], [text.user, state.me?.principal?.email || state.me?.principal?.subject || '—', text.accessCopy], [text.server, state.config?.aiMode === 'local-guidance' ? text.aiLocal : state.config?.aiMode || '—', text.legal]];
    for (const [label, value, note] of cards) { const card = make('article', { class: 'ops-readiness-card' }); append(card, make('p', {}, label), make('strong', {}, value), make('small', {}, note)); grid.append(card); }
    refs.content.append(grid);
    const empty = Object.values(state.collections).every((items) => !items.length);
    refs.content.append(stateCard('normal', empty ? text.empty : text.noCounts, empty ? text.dashboardHelp : text.noCounts));
  }
  function renderAssistant() {
    clear(refs.content); refs.content.setAttribute('aria-busy', 'false');
    const selected = getSelected('requests') || known('requests')[0] || null;
    const wrap = make('div', { class: 'ops-assistant' }); const main = make('section', { class: 'ops-panel' }); const note = make('aside', { class: 'ops-panel ops-assistant-note' });
    const vertex = state.config?.aiMode === 'vertex'; append(main, make('p', { class: 'ops-eyebrow', text: vertex ? text.aiVertex : text.aiLocal }), make('h2', {}, text.aiTitle), make('p', {}, vertex ? text.aiVertexCopy : text.aiLocalCopy));
    if (!selected) main.append(make('div', { class: 'ops-empty-inline', text: text.aiNoRequest }));
    else {
      const pick = make('label', { class: 'ops-field' }); pick.append(make('span', {}, text.request)); const select = make('select'); for (const request of known('requests')) select.append(make('option', { value: request.id, text: `${request.title || request.id} · ${request.id}`, selected: request.id === selected.id })); select.addEventListener('change', () => { state.selected.requests = select.value; render(); }); pick.append(select); main.append(pick);
      const purpose = make('label', { class: 'ops-field' }); purpose.append(make('span', {}, text.aiPurpose)); const purposeSelect = make('select', { id: 'ops-ai-purpose' }); [["summary", text.summary], ["action_plan", text.actionPlan], ["correspondence", text.correspondence]].forEach(([value, label]) => purposeSelect.append(make('option', { value, text: label }))); purpose.append(purposeSelect); main.append(purpose);
      const approved=state.aiApprovals.get(selected.id)===selected.version || (selected.aiUseApproval?.classification==='non_sensitive'&&selected.aiUseApproval?.validForVersion===selected.version);
      if (vertex && can('ai:approve') && !approved) { const approval = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.aiApprove }); approval.addEventListener('click', () => approveAi(selected)); main.append(approval); }
      if (vertex && !approved) main.append(make('p', { class: 'ops-form-note', text: text.aiNeedsApproval }));
      if (can('ai:draft') && (!vertex || approved)) { const draftButton = make('button', { type: 'button', class: 'ops-button ops-button-primary', text: text.aiDraft }); draftButton.addEventListener('click', () => createAiDraft(selected, purposeSelect)); main.append(draftButton); }
    }
    append(note, make('h2', {}, text.legal), make('p', {}, text.copyNote)); wrap.append(main, note);
    if (state.aiDraft) wrap.append(renderDraft(state.aiDraft)); refs.content.append(wrap);
  }
  function renderDraft(draft) {
    const box = make('section', { class: 'ops-draft' }); append(box, make('p', { class: 'ops-eyebrow', text: text.aiDraftLabel }), make('h2', {}, text.aiDraftLabel), make('pre', {}, draft.text || ''), make('small', {}, `${text.sourceRefs}: ${(draft.sourceRefs || []).join(', ') || '—'}`), make('small', {}, `${text.status}: ${draft.status || 'draft'} · ${draft.provider || '—'}`));
    const copy = make('button', { type: 'button', class: 'ops-button ops-button-secondary', text: text.copyToDoc }); copy.addEventListener('click', () => openDialog('documents', 'create', null, draft)); box.append(copy, make('p', { class: 'ops-form-note', text: text.copyNote })); return box;
  }
  function render() {
    setNavigation(); setToolbar();
    if (isBlocked()) { renderBlocked(); return; }
    if (state.active === 'dashboard') renderDashboard(); else if (state.active === 'assistant') renderAssistant(); else renderEntity(state.active);
  }
  async function loadList(entity, appendMode = false) {
    if (state.mode !== 'ready') return; const info = state.list[entity]; const q=state.active===entity?refs.search.value.trim():info.filterQuery||''; const status=state.active===entity?refs.filter.value:info.filterStatus||''; info.filterQuery=q;info.filterStatus=q?'':status; info.status='loading'; render();
    const params = new URLSearchParams({ limit: '50' }); if(q)params.set('q',q);else if(status)params.set('status',status); if(appendMode&&info.nextCursor)params.set('cursor',info.nextCursor);
    try { const result = await getApi(`/api/ops/${entity}?${params}`); const items = Array.isArray(result?.items) ? result.items : []; state.collections[entity] = appendMode ? state.collections[entity].concat(items) : items; info.nextCursor = result?.nextCursor || null; info.status = 'loaded'; if (!getSelected(entity) && items[0]) state.selected[entity] = items[0].id; }
    catch (error) { if (error?.status === 401 || error?.status === 403 || error?.status === 503) { state.mode = error.status === 401 ? 'signin' : error.status === 403 ? 'forbidden' : 'disabled'; updateConnection(error.status === 401 ? text.connectionPermission : error.status === 403 ? text.forbidden : text.connectionDisabled, 'warning'); } else { info.status = 'error'; info.error = messageFrom(error); } }
    render(); return info.status==='loaded'&&state.mode==='ready';
  }
  async function loadAll() { await Promise.all(Object.keys(entityConfig).map((entity) => loadList(entity))); }
  function messageFrom(error) {const labels={invalid_query:'البحث بكلمة واحدة، أو اختر تصفية الحالة.',query_combination_not_supported:'استخدم البحث أو الحالة، وليس كليهما.',invalid_input:'راجع الحقول المطلوبة وأطوال النصوص.',invalid_transition:'هذا الانتقال غير مسموح من الحالة الحالية.',version_conflict:text.conflict,idempotency_key_reused:'هذا الطلب استخدم سابقًا مع محتوى مختلف. أعد فتح السجل.',assignee_not_allowed:'المسؤول غير معتمد في إعدادات الفريق.',document_revise_required:'أنشئ مراجعة جديدة للملف المعتمد بدل التعديل الصامت.',rate_limited:'بلغت الحد المؤقت للطلبات. انتظر دقيقة.',ai_draft_in_progress:'المسودة قيد الإعداد؛ لم يبدأ استدعاء إضافي.',ai_draft_failed:'فشلت محاولة المسودة السابقة؛ تحتاج محاولة جديدة.',ai_source_version_changed:'تغيّر المصدر؛ راجع النسخة الحالية قبل إنشاء مسودة.',ai_approval_required:'اعتمد تصنيف المصدر والإصدار الحالي قبل المعالجة.'};if(lang==='ar'&&labels[error?.body?.error])return labels[error.body.error]; if (error?.status === 401) return text.signedOut; if (error?.status === 403) return text.forbidden; if (error?.status === 503) return text.disabledCopy; return error?.body?.error || error?.message || text.apiError; }
  async function boot() {
    refs.content.setAttribute('aria-busy', 'true');
    if (isGitHubPages()) { state.mode = 'static'; updateConnection(text.static, 'warning'); render(); return; }
    state.mode = 'booting'; updateConnection(text.loading); clear(refs.action); clear(refs.content); refs.content.append(stateCard('loading', text.loading, text.noCounts));
    try {
      state.config = await getApi('/api/ops/config'); updateEnvironment();
      if (!state.config?.enabled || state.config?.deploymentMode === 'disabled' || state.config?.persistence === 'none') { state.mode = 'disabled'; updateConnection(text.connectionDisabled, 'warning'); render(); return; }
      state.me = await getApi('/api/ops/me'); state.mode = 'ready'; updateConnection(text.connectionReady, 'ready'); await loadAll(); say(text.apiReady);
    } catch (error) {
      state.mode = error?.status === 401 ? 'signin' : error?.status === 403 ? 'forbidden' : error?.status === 503 ? 'disabled' : error?.network ? 'offline' : 'error';
      updateConnection(state.mode === 'signin' ? text.connectionPermission : state.mode === 'forbidden' ? text.forbidden : state.mode === 'disabled' ? text.connectionDisabled : state.mode === 'offline' ? text.connectionOffline : text.connectionError, state.mode === 'signin' || state.mode === 'forbidden' ? 'warning' : 'error'); render();
    }
  }
  function recordPayload(entity, form, mode) {
    const value = (name) => String(new window.FormData(form).get(name) || '').trim(); const optional = (name) => { const result = value(name); return result || undefined; };
    if (entity === 'requests') return { title: value('title'), companyName: value('companyName'), contactName: value('contactName'), email: value('email'), phone: value('phone'), service: value('service'), city: value('city'), description: value('description'), priority: value('priority') || 'normal', assigneeEmail: optional('assigneeEmail'), clientId: optional('clientId') };
    if (entity === 'clients') return { name: value('name'), contactName: value('contactName'), email: value('email'), phone: value('phone'), city: value('city'), notes: optional('notes') };
    if (entity === 'tasks') return { title: value('title'), description: value('description'), requestId: optional('requestId'), clientId: optional('clientId'), assigneeEmail: optional('assigneeEmail'), dueDate: optional('dueDate'), priority: value('priority') || 'normal' };
    const payload = { title: value('title'), kind: value('kind'), content: value('content'), requestId: optional('requestId'), clientId: optional('clientId') };
    if (mode === 'revise') payload.revise = true; return payload;
  }
  function formField(label, name, options = {}) {
    const wrap = make('label', { class: `ops-field${options.full ? ' is-full' : ''}` }); wrap.append(make('span', {}, label)); let control;
    if (options.type === 'textarea') control = make('textarea', { name, required: !!options.required, maxLength: options.maxLength, value: options.value || '' });
    else if (options.options) { control = make('select', { name, required: !!options.required }); options.options.forEach(([value, caption]) => control.append(make('option', { value, text: caption, selected: String(options.value || '') === String(value) }))); }
    else control = make('input', { name, type: options.type || 'text', required: !!options.required, maxLength: options.maxLength, value: options.value || '' });
    wrap.append(control); if (options.help) wrap.append(make('small', {}, options.help)); return wrap;
  }
  function linkedOptions(entity, selected) { const items = known(entity); return [['', items.length ? '—' : text.noLinks], ...items.map((item) => [item.id, `${entity === 'clients' ? item.name : item.title || item.id} · ${item.id}`])].map(([id, label]) => [id, label]); }
  function assigneeOptions(selected) { const assignees = getAssignees(); return [['', assignees.length ? '—' : text.noAssignee], ...assignees.map((email) => [email, email])]; }
  function buildForm(entity, mode, record = {}, draft = null) {
    clear(refs.dialogBody); refs.formError.hidden = true; refs.formError.textContent = ''; const newTitle = mode === 'revise' ? text.formRevise : mode === 'edit' ? text.formEdit : text.formNew; refs.dialogTitle.textContent = `${newTitle}: ${entityConfig[entity].label}`; refs.submit.textContent = text.save;
    refs.dialogBody.append(make('p', { class: 'ops-form-note', text: text.formWarning })); const grid = make('div', { class: 'ops-form-grid' });
    if (entity === 'requests') append(grid, formField(text.title, 'title', { required: true, maxLength: 160, value: record.title }), formField(text.companyName, 'companyName', { maxLength: 160, value: record.companyName }), formField(text.contactName, 'contactName', { maxLength: 160, value: record.contactName }), formField(text.email, 'email', { type: 'email', maxLength: 254, value: record.email }), formField(text.phone, 'phone', { maxLength: 32, value: record.phone }), formField(text.service, 'service', { maxLength: 100, value: record.service }), formField(text.city, 'city', { maxLength: 100, value: record.city }), formField(text.priority, 'priority', { options: [['normal', labelForStatus('normal')], ['high', labelForStatus('high')]], value: record.priority || 'normal' }), formField(text.assigned, 'assigneeEmail', { options: assigneeOptions(record.assigneeEmail), value: record.assigneeEmail }), formField(text.linkClient, 'clientId', { options: linkedOptions('clients'), value: record.clientId }), formField(text.description, 'description', { type: 'textarea', full: true, maxLength: 4000, value: record.description }));
    if (entity === 'clients') append(grid, formField(text.companyName, 'name', { maxLength: 160, value: record.name }), formField(text.contactName, 'contactName', { maxLength: 160, value: record.contactName }), formField(text.email, 'email', { type: 'email', maxLength: 254, value: record.email }), formField(text.phone, 'phone', { maxLength: 32, value: record.phone }), formField(text.city, 'city', { maxLength: 100, value: record.city }), formField(text.notes, 'notes', { type: 'textarea', full: true, maxLength: 4000, value: record.notes }));
    if (entity === 'tasks') append(grid, formField(text.title, 'title', { required: true, maxLength: 160, value: record.title }), formField(text.dueDate, 'dueDate', { type: 'date', value: record.dueDate }), formField(text.priority, 'priority', { options: [['normal', labelForStatus('normal')], ['high', labelForStatus('high')]], value: record.priority || 'normal' }), formField(text.assigned, 'assigneeEmail', { options: assigneeOptions(record.assigneeEmail), value: record.assigneeEmail }), formField(text.linkRequest, 'requestId', { options: linkedOptions('requests'), value: record.requestId }), formField(text.linkClient, 'clientId', { options: linkedOptions('clients'), value: record.clientId }), formField(text.description, 'description', { type: 'textarea', full: true, maxLength: 4000, value: record.description }));
    if (entity === 'documents') append(grid, formField(text.title, 'title', { required: true, maxLength: 160, value: record.title || (draft ? `${text.document}: ${draft.id || ''}` : '') }), formField(text.kind, 'kind', { required: true, options: [['procedure',labelForStatus('procedure')],['service_report',labelForStatus('service_report')],['proposal',labelForStatus('proposal')],['correspondence',labelForStatus('correspondence')]], value: record.kind || 'procedure' }), formField(text.linkRequest, 'requestId', { options: linkedOptions('requests'), value: record.requestId || draft?.requestId }), formField(text.linkClient, 'clientId', { options: linkedOptions('clients'), value: record.clientId }), formField(text.content, 'content', { type: 'textarea', full: true, required: true, maxLength: 12000, value: record.content || draft?.text || '' }));
    refs.dialogBody.append(grid);
  }
  function openDialog(entity, mode, record = null, draft = null) {
    if (!can(entityConfig[entity].permission)) { say(text.disabledAction); return; }
    state.lastFocus = document.activeElement; state.dialogContext = { entity, mode, record, draft }; buildForm(entity, mode, record || {}, draft); if (typeof refs.dialog.showModal === 'function') refs.dialog.showModal(); else refs.dialog.setAttribute('open', ''); const first = refs.dialog.querySelector('input,select,textarea,button'); first?.focus();
  }
  function closeDialog() { if (refs.dialog.open && typeof refs.dialog.close === 'function') refs.dialog.close(); else refs.dialog.removeAttribute('open'); state.dialogContext = null; state.lastFocus?.focus?.(); }
  async function submitForm(event) {
    event.preventDefault(); const context = state.dialogContext; if (!context || !refs.form.reportValidity()) return; const { entity, mode, record } = context; const payload = recordPayload(entity, refs.form, mode);
    refs.submit.disabled = true; refs.formError.hidden = true;
    try { const result = mode === 'create' ? await writeApi(`/api/ops/${entity}`, 'POST', payload) : await writeApi(`/api/ops/${entity}/${encodeURIComponent(record.id)}`, 'PATCH', { ...payload, version: record.version }); if (!result?.item) throw new Error('missing_server_item'); state.selected[entity] = result.item.id; closeDialog(); const refreshed=await loadList(entity);say(refreshed?text.saved:(lang==='ar'?'تم الحفظ، لكن تعذر تحديث القائمة؛ أعد التحميل.':'Saved, but the list refresh failed. Reload it.'));  }
    catch (error) { if (error?.status === 409) { refs.formError.textContent = text.conflict; await loadList(entity); } else refs.formError.textContent = `${text.saveFailed}${messageFrom(error)}`; refs.formError.hidden = false; }
    finally { refs.submit.disabled = false; }
  }
  function openTransitionDialog(entity, record) {
    if (!can(entityConfig[entity].permission)) return; state.lastFocus = document.activeElement; state.dialogContext = { entity, mode: 'transition', record }; clear(refs.dialogBody); refs.dialogTitle.textContent = text.transitionTitle; refs.submit.textContent = text.transition; refs.formError.hidden = true; const wrap = make('label', { class: 'ops-field' }); wrap.append(make('span', {}, text.status)); const select = make('select', { name: 'transition-status' }); (({requests:{new:['in_review','closed'],in_review:['in_progress','awaiting_client','closed'],in_progress:['awaiting_client','completed','closed'],awaiting_client:['in_progress','completed','closed'],completed:['closed']},clients:{active:['inactive'],inactive:['active']},tasks:{todo:['in_progress','cancelled'],in_progress:['done','cancelled']},documents:{draft:['in_review','archived'],in_review:['draft','approved'],approved:['archived']}})[entity][record.status]||[]).forEach((status) => select.append(make('option', { value: status, text: labelForStatus(status) }))); wrap.append(select); refs.dialogBody.append(make('p', { class: 'ops-form-note', text: text.legal }), wrap); if (typeof refs.dialog.showModal === 'function') refs.dialog.showModal(); else refs.dialog.setAttribute('open', ''); select.focus();
  }
  async function submitTransition() {
    const { entity, record } = state.dialogContext; const status = new window.FormData(refs.form).get('transition-status'); refs.submit.disabled = true; try { const result = await writeApi(`/api/ops/${entity}/${encodeURIComponent(record.id)}/transition`, 'POST', { status, version: record.version }); if (!result?.item) throw new Error('missing_server_item'); state.selected[entity] = result.item.id; closeDialog(); const refreshed=await loadList(entity);say(refreshed?text.saved:(lang==='ar'?'تم الحفظ، لكن تعذر تحديث القائمة؛ أعد التحميل.':'Saved, but the list refresh failed. Reload it.'));  } catch (error) { refs.formError.textContent = error?.status === 409 ? text.conflict : `${text.saveFailed}${messageFrom(error)}`; refs.formError.hidden = false; } finally { refs.submit.disabled = false; }
  }
  async function approveDocument(record) { if (!can('documents:approve') || !window.confirm(text.approveConfirm)) return; try { const result = await writeApi(`/api/ops/documents/${encodeURIComponent(record.id)}/transition`, 'POST', { status: 'approved', version: record.version }); if (!result?.item) throw new Error('missing_server_item'); const refreshed=await loadList('documents');say(refreshed?text.saved:(lang==='ar'?'تم الاعتماد داخليًا، لكن تعذر تحديث القائمة؛ أعد التحميل.':'Approved internally, but refresh failed. Reload it.'));  } catch (error) { say(error?.status === 409 ? text.conflict : `${text.saveFailed}${messageFrom(error)}`); } }
  function revisionLabel(item){if(item.approval?.type==='internal_human_approval')return labelForStatus('approved');const action=String(item.action||'');const type=action.split(':')[0];const ar={create:'إنشاء نسخة',update:'تعديل مسودة',revise:'بدء مراجعة جديدة',transition:'تغيير حالة الملف',save_ai_draft:'حفظ مسودة AI'};return lang==='ar'&&Object.hasOwn(ar,type)?ar[type]:(action||'—');}
  async function loadHistory(record, panel) { const history = make('section', { class: 'ops-history' }); append(history, make('h3', {}, text.history), make('p', {}, text.historyLoad)); panel.querySelector('.ops-history')?.remove(); panel.append(history); try { const result = await getApi(`/api/ops/documents/${encodeURIComponent(record.id)}/history`); clear(history); history.append(make('h3', {}, text.history)); const items = Array.isArray(result?.items) ? result.items : []; if (!items.length) history.append(make('p', {}, text.historyEmpty)); else { const list = make('ul', { class: 'ops-history-list' }); for (const item of items) list.append(make('li', {}, `${item.createdAt||'—'} · ${revisionLabel(item)} · ${item.documentVersion||'—'}`)); history.append(list); } } catch (error) { clear(history); append(history, make('h3', {}, text.history), make('p', {}, messageFrom(error))); } }
  function download(content, name, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = make('a', { href: url, download: name }); document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
  async function exportDocument(record) { try { const content = await rawRequest(`/api/ops/documents/${encodeURIComponent(record.id)}/export?format=md`, { headers: { Accept: 'text/markdown' }, credentials: 'same-origin' }); download(typeof content === 'string' ? content : '', `${record.id}.md`, 'text/markdown;charset=utf-8'); say(text.reportSaved); } catch (error) { say(messageFrom(error)); } }
  async function exportReport() { try { const result = await getApi('/api/ops/reports/export'); download(JSON.stringify(result, null, 2), 'operations-report.json', 'application/json;charset=utf-8'); say(text.reportSaved); } catch (error) { say(messageFrom(error)); } }
  async function approveAi(request) { if (!can('ai:approve')) return; try { const result = await writeApi(`/api/ops/requests/${encodeURIComponent(request.id)}/ai-approval`, 'POST', { version: request.version, classification: 'non_sensitive' }); if(!result?.item)throw new Error('missing_server_item');state.collections.requests=state.collections.requests.map(item=>item.id===request.id?result.item:item);state.aiApprovals.set(request.id,result.item.version); say(text.saved); render(); } catch (error) { say(`${text.saveFailed}${messageFrom(error)}`); } }
  async function createAiDraft(request, purposeSelect) { if (!can('ai:draft')) return; const vertex = state.config?.aiMode === 'vertex'; if (vertex && state.aiApprovals.get(request.id)!==request.version && request.aiUseApproval?.validForVersion!==request.version) { say(text.aiNeedsApproval); return; } try { const result = await writeApi('/api/ops/ai/draft', 'POST', { requestId: request.id, purpose: purposeSelect.value }); if (!result?.draft) throw new Error('missing_server_draft'); state.aiDraft = { ...result.draft, requestId: request.id };say(result.draft.persisted?text.saved:(lang==='ar'?'تم إعداد مسودة غير محفوظة للمراجعة.':'A non-persisted review draft is ready.')); render(); } catch (error) { say(`${text.saveFailed}${messageFrom(error)}`); } }
  function selectSection(section) { state.active = section; refs.search.value = ''; refs.filter.value = ''; render(); if (entityConfig[section] && state.list[section].status === 'idle') loadList(section); }
  document.addEventListener('click', (event) => { const button = event.target.closest('[data-action]'); if (!button) return; const action = button.dataset.action; if (action === 'toggle-menu') { const open = !refs.body.classList.contains('ops-drawer-open'); refs.body.classList.toggle('ops-drawer-open', open); button.setAttribute('aria-expanded', String(open)); if (open) document.querySelector('.ops-sidebar-close')?.focus(); } if (action === 'close-menu') { refs.body.classList.remove('ops-drawer-open'); document.querySelector('[data-action="toggle-menu"]')?.setAttribute('aria-expanded', 'false'); document.querySelector('[data-action="toggle-menu"]')?.focus(); } if (action === 'close-dialog') closeDialog(); });
  document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => selectSection(button.dataset.section)));
  refs.search.addEventListener('input', () => { if (!entityConfig[state.active]) return; window.clearTimeout(state.debounce); state.debounce = window.setTimeout(() => loadList(state.active), 350); });
  refs.filter.addEventListener('change', () => { if (entityConfig[state.active]) loadList(state.active); });
  refs.form.addEventListener('submit', (event) => { event.preventDefault(); if (state.dialogContext?.mode === 'transition') submitTransition(); else submitForm(event); });
  refs.dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  window.addEventListener('offline', () => { if (state.mode === 'ready') { state.mode = 'offline'; updateConnection(text.connectionOffline, 'error'); render(); } });
  window.addEventListener('online', () => { if (state.mode === 'offline') boot(); });
  boot();
})();
