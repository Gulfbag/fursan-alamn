import {
  IncidentStatuses,
  Roles,
  approveClosureReview,
  buildLocalRuleBasedDraft,
  canApproveClosure,
  canCloseIncident,
  canCreateIncident,
  canReadEntity,
  canReviewVideoEvent,
  canTransitionIncident,
  completeChecklistTask,
  createDemoState,
  createIncident,
  deriveMetrics,
  reviewVideoEvent,
  transitionIncident,
  viewerFor,
} from './platform-domain.mjs';
import { portalSeed } from './platform-seed.mjs';

const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
const rtl = lang === 'ar';
const state = createDemoState(portalSeed);
const refs = {
  content: document.querySelector('#portal-content'),
  role: document.querySelector('#role-select'),
  search: document.querySelector('#portal-search'),
  filter: document.querySelector('#status-filter'),
  live: document.querySelector('#portal-live'),
  dialog: document.querySelector('#incident-dialog'),
  form: document.querySelector('#incident-form'),
  error: document.querySelector('#incident-error'),
};

const text = {
  ar: {
    roles: { operations: 'العمليات', supervisor: 'المشرف', guard: 'الحارس', client: 'العميل', system: 'النظام' },
    status: { new: 'جديد', triaged: 'فرز', assigned: 'مسند', resolved: 'محلول', closed: 'مغلق' },
    overview: 'نظرة عامة', incidents: 'البلاغات', shifts: 'الورديات وقوائم التحقق', reports: 'التقارير', assistant: 'المساعد المنضبط', integrations: 'جاهزية الربط',
    sites: 'المواقع المتاحة', openTasks: 'قوائم تحقق مفتوحة', completedTasks: 'قوائم مكتملة', openIncidents: 'بلاغات مرئية مفتوحة', approvedReports: 'تقارير معتمدة',
    scope: 'نطاق العرض الحالي', site: 'الموقع', contract: 'العقد', serviceDate: 'تاريخ الخدمة', service: 'الخدمة', statusLabel: 'الحالة',
    noIncidents: 'لا توجد بلاغات مرئية لهذا الدور أو لهذه التصفية.', noTasks: 'لا توجد قوائم تحقق متاحة لهذا الدور.', noReports: 'لا توجد تقارير مصرح بها لهذا الدور.',
    createIncident: 'إنشاء بلاغ تجريبي', selectIncident: 'اختيار البلاغ', triage: 'فرز البلاغ', assign: 'إسناد البلاغ', resolve: 'تسجيل الحل', approveReview: 'اعتماد مراجعة الإغلاق', close: 'إغلاق بعد المراجعة',
    restricted: 'هذا القسم غير متاح للدور التجريبي الحالي.', clientBoundary: 'يعرض العميل العقد C01 وموقعه والتقرير المجمع المعتمد فقط. لا تظهر البلاغات أو الموظفون أو أدلة الكاميرات.',
    task: 'قائمة تحقق', complete: 'تأكيد الإنجاز في الذاكرة', completeNote: 'يتغير المؤشر في هذه الجلسة فقط.',
    humanReview: 'مراجعة بشرية لإشارة الفيديو', videoBoundary: 'الإشارة غير مؤكدة؛ لا وجوه ولا خطر فردي. لا ينشأ بلاغ تلقائيًا.', exclude: 'استبعاد', follow: 'متابعة', createAfterReview: 'إنشاء بلاغ بعد المراجعة', decide: 'تسجيل قرار المراجع',
    reviewPending: 'بانتظار المراجعة البشرية', selfSeparation: 'لا يمكن لمنشئ البلاغ اعتماد مراجعته.', closureGate: 'لا يمكن الإغلاق قبل اقتراح الإغلاق واعتماد المراجعة من مراجع آخر.',
    reportsNote: 'يعرض التقرير المعتمد المؤشرات المجمعة المصرح بها فقط؛ ليس تقريرًا تشغيليًا مباشرًا.', draft: 'مسودة', approved: 'معتمد', internal: 'داخلي',
    assistantHonest: 'الذكاء التوليدي غير مفعل؛ لم يتم تكوين مزوّد ومصادقة وحماية البيانات.', assistantAction: 'تكوين مسودة من الحقول (دون ذكاء توليدي)', selectIncident: 'اختر بلاغًا مرئيًا', assistantEngine: 'المحرك: LocalRuleBased — تنسيق حتمي من الحقول؛ ليس ذكاءً توليديًا.', futureAi: 'المستقبل المقترح فقط: RAG بنطاق صلاحية، ملخصات مقيدة، وOCR مع اعتماد بشري. لا توجد API أو معالجة خارجية مفعلة هنا.',
    draftCreated: 'تم نشر المسودة محليًا بحالة «مسودة» للمراجعة؛ لم يُحفظ شيء خارج الجلسة.',
    integrationsTitle: 'حالة الربط الواقعية', integrationNote: 'هذه حالات جاهزية موثقة للعرض، وليست إشارات نجاح أو اتصال فعلي.',
    gcp: 'Google Cloud: مشروع fursan-alamn-prod قائم/ظاهر بحسب المستخدم، لكن الوصول غير متحقق والبوابة غير منشورة عليه.', master: 'FursanMasterDatabase: لم يربط؛ لقطة Google Sheets ليست مخطط بيانات.', identity: 'هوية إنتاجية / MFA: قيد الإعداد.', vms: 'VMS / Edge: غير متصل.',
    nextStep: 'الإجراء الداخلي التالي', nextStepText: 'اعتماد نموذج الهوية والصلاحيات، ثم التحقق من الوصول ومخطط البيانات قبل أي ربط.',
    audit: 'سجل التدقيق في الذاكرة', timestamp: 'الوقت', actor: 'الفاعل', role: 'الدور', action: 'الإجراء', from: 'من', to: 'إلى',
    selected: 'محدد', sectionUpdated: 'تم تحديث قسم العرض.', roleUpdated: 'تم تغيير دور العرض التجريبي.', incidentCreated: 'تم إنشاء بلاغ تجريبي في الذاكرة.', taskCompleted: 'تم تأكيد قائمة التحقق وتحديث المؤشرات في الذاكرة.', actionDenied: 'الإجراء غير متاح ضمن حدود دور العرض.', videoRecorded: 'تم تسجيل قرار المراجع البشري في الذاكرة.', reviewApproved: 'تم اعتماد مراجعة الإغلاق بواسطة دور العمليات.', escaped: 'لا بيانات شخصية أو أدلة فيديو معروضة في هذه البوابة.',
    noReadableIncident: 'لا يوجد بلاغ متاح لصياغة مسودة لهذا الدور.', auditEmpty: 'لا توجد أحداث تدقيق ظاهرة لهذا الدور.', contentFor: 'عرض مقيد بدور',
  },
  en: {
    roles: { operations: 'Operations', supervisor: 'Supervisor', guard: 'Guard', client: 'Client', system: 'System' },
    status: { new: 'New', triaged: 'Triaged', assigned: 'Assigned', resolved: 'Resolved', closed: 'Closed' },
    overview: 'Overview', incidents: 'Incidents', shifts: 'Shifts & checklists', reports: 'Reports', assistant: 'Governed assistant', integrations: 'Integration readiness',
    sites: 'Available sites', openTasks: 'Open checklists', completedTasks: 'Completed checklists', openIncidents: 'Visible open incidents', approvedReports: 'Approved reports',
    scope: 'Current demo scope', site: 'Site', contract: 'Contract', serviceDate: 'Service date', service: 'Service', statusLabel: 'Status',
    noIncidents: 'No incidents are visible for this role or filter.', noTasks: 'No checklists are available for this role.', noReports: 'No reports are authorized for this role.',
    createIncident: 'Create demo incident', selectIncident: 'Select incident', triage: 'Triage incident', assign: 'Assign incident', resolve: 'Record resolution', approveReview: 'Approve closure review', close: 'Close after review',
    restricted: 'This area is unavailable for the current demo role.', clientBoundary: 'The client sees only contract C01, its site, and the approved aggregate report. Incidents, employees, and camera evidence are not displayed.',
    task: 'Checklist', complete: 'Confirm in memory', completeNote: 'This changes the KPI in this session only.',
    humanReview: 'Human review of video signal', videoBoundary: 'The signal is unconfirmed; no faces and no individual risk. It never creates an incident automatically.', exclude: 'Exclude', follow: 'Follow up', createAfterReview: 'Create incident after review', decide: 'Record reviewer decision',
    reviewPending: 'Awaiting human review', selfSeparation: 'The incident creator cannot approve its review.', closureGate: 'Closing needs a closure proposal and approval by a different reviewer.',
    reportsNote: 'The approved report exposes authorized aggregate indicators only; it is not a live operations report.', draft: 'Draft', approved: 'Approved', internal: 'Internal',
    assistantHonest: 'Generative AI is not enabled; no provider, authentication, or data protection has been configured.', assistantAction: 'Create a draft from fields (without generative AI)', selectIncident: 'Select a visible incident', assistantEngine: 'Engine: LocalRuleBased — deterministic formatting from fields; not generative AI.', futureAi: 'Future proposal only: scoped RAG, constrained summaries, and OCR with human approval. No API or external processing is active here.',
    draftCreated: 'A local draft was published with “draft” status for review; nothing was saved outside this session.',
    integrationsTitle: 'Actual integration state', integrationNote: 'These are demo-readiness states, not successful or live connections.',
    gcp: 'Google Cloud: project fursan-alamn-prod exists/is visible per the user, but access is unverified and this portal is not deployed there.', master: 'FursanMasterDatabase: not connected; the Google Sheets screenshot is not a data schema.', identity: 'Production identity / MFA: being prepared.', vms: 'VMS / Edge: disconnected.',
    nextStep: 'Next internal action', nextStepText: 'Ratify the identity and authorization model, then verify access and data schema before any integration.',
    audit: 'In-memory audit trail', timestamp: 'Timestamp', actor: 'Actor', role: 'Role', action: 'Action', from: 'From', to: 'To',
    selected: 'Selected', sectionUpdated: 'Demo section updated.', roleUpdated: 'Demo role view changed.', incidentCreated: 'Demo incident created in memory.', taskCompleted: 'Checklist confirmed and KPIs updated in memory.', actionDenied: 'This action is unavailable under the demo-role boundary.', videoRecorded: 'Human reviewer decision recorded in memory.', reviewApproved: 'Closure review approved by the operations role.', escaped: 'No personal data or video evidence is displayed in this portal.', noReadableIncident: 'No incident is available for this role to draft from.', auditEmpty: 'No audit events are visible for this role.', contentFor: 'Display restricted to role',
  },
}[lang];

let activeRole = Roles.operations;
let activeSection = 'overview';
let selectedIncidentId = null;
let lastFocus = null;
let latestDraft = null;

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const local = (value) => typeof value === 'object' && value ? value[lang] || value.ar || value.en || '' : String(value ?? '');
const viewer = () => viewerFor(state, activeRole);
const find = (entity, id) => state[entity].find((item) => item.id === id);
const siteFor = (id) => find('sites', id);
const contractFor = (id) => find('contracts', id);
const visible = (entity) => state[entity].filter((item) => canReadEntity(state, viewer(), entity, item));
const announce = (message) => { refs.live.textContent = message; };
const statusBadge = (status) => `<span class="portal-status is-${escapeHtml(status)}">${escapeHtml(text.status[status] || status)}</span>`;
const roleName = (role) => text.roles[role] || role;
const replaceState = (next) => Object.assign(state, next);

function setActiveNavigation() {
  document.querySelectorAll('[data-section]').forEach((button) => {
    const active = button.dataset.section === activeSection;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function metric(label, value, note) {
  return `<article class="portal-metric"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function sectionHeader(title, description, action = '') {
  return `<header class="portal-section-heading"><div><p class="portal-eyebrow">${escapeHtml(text.contentFor)}: ${escapeHtml(roleName(activeRole))}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>${action}</header>`;
}

function boundary(message, tone = 'neutral') {
  return `<div class="portal-boundary is-${tone}" role="note"><strong>${escapeHtml(message)}</strong></div>`;
}

function scopeCards() {
  const sites = visible('sites');
  const contracts = visible('contracts');
  return `<div class="portal-scope-grid">${sites.map((site) => `<article class="portal-scope-card"><span>${escapeHtml(text.site)} · ${escapeHtml(site.id)}</span><strong>${escapeHtml(local(site.name))}</strong><small>${escapeHtml(local(site.zone))}</small></article>`).join('')}${contracts.map((contract) => `<article class="portal-scope-card"><span>${escapeHtml(text.contract)} · ${escapeHtml(contract.id)}</span><strong>${escapeHtml(local(contract.client))}</strong><small>${escapeHtml(local(contract.scope))}</small></article>`).join('')}</div>`;
}

function incidentControls(incident) {
  const currentViewer = viewer();
  const controls = [];
  if (canTransitionIncident(state, currentViewer, incident, IncidentStatuses.triaged)) controls.push(`<button class="portal-secondary-button" type="button" data-action="transition" data-incident-id="${incident.id}" data-to="triaged">${escapeHtml(text.triage)}</button>`);
  if (canTransitionIncident(state, currentViewer, incident, IncidentStatuses.assigned)) controls.push(`<button class="portal-secondary-button" type="button" data-action="transition" data-incident-id="${incident.id}" data-to="assigned">${escapeHtml(text.assign)}</button>`);
  if (canTransitionIncident(state, currentViewer, incident, IncidentStatuses.resolved)) controls.push(`<button class="portal-secondary-button" type="button" data-action="transition" data-incident-id="${incident.id}" data-to="resolved">${escapeHtml(text.resolve)}</button>`);
  if (canApproveClosure(currentViewer, incident)) controls.push(`<button class="portal-primary-button" type="button" data-action="approve-review" data-incident-id="${incident.id}">${escapeHtml(text.approveReview)}</button>`);
  if (canCloseIncident(state, currentViewer, incident)) controls.push(`<button class="portal-primary-button" type="button" data-action="transition" data-incident-id="${incident.id}" data-to="closed">${escapeHtml(text.close)}</button>`);
  if (incident.status === 'resolved' && currentViewer.role === Roles.operations && incident.creatorId === currentViewer.actorId) controls.push(`<small class="portal-control-note">${escapeHtml(text.selfSeparation)}</small>`);
  if (incident.status === 'resolved' && !canCloseIncident(state, currentViewer, incident) && incident.creatorId !== currentViewer.actorId) controls.push(`<small class="portal-control-note">${escapeHtml(text.closureGate)}</small>`);
  return controls.join('');
}

function incidentCard(incident) {
  const site = siteFor(incident.siteId);
  const contract = contractFor(incident.contractId);
  const selected = selectedIncidentId === incident.id;
  return `<article class="portal-incident${selected ? ' is-selected' : ''}"><header><div><p class="portal-record-id">${escapeHtml(incident.id)}${selected ? ` · ${escapeHtml(text.selected)}` : ''}</p><h3>${escapeHtml(local(incident.title))}</h3></div>${statusBadge(incident.status)}</header><dl class="portal-meta"><div><dt>${escapeHtml(text.site)}</dt><dd>${escapeHtml(local(site.name))}</dd></div><div><dt>${escapeHtml(text.contract)}</dt><dd>${escapeHtml(contract.id)}</dd></div><div><dt>${escapeHtml(text.serviceDate)}</dt><dd dir="ltr">${escapeHtml(incident.serviceDate)}</dd></div><div><dt>${escapeHtml(text.service)}</dt><dd>${escapeHtml(incident.service)}</dd></div></dl><div class="portal-card-actions"><button class="portal-quiet-button" type="button" data-action="select-incident" data-incident-id="${incident.id}">${escapeHtml(selected ? text.selected : text.selectIncident)}</button>${incidentControls(incident)}</div></article>`;
}

function visibleIncidents() {
  const query = refs.search.value.trim().toLocaleLowerCase();
  const status = refs.filter.value;
  return visible('incidents').filter((incident) => {
    const haystack = `${incident.id} ${local(incident.title)} ${incident.status}`.toLocaleLowerCase();
    return (!query || haystack.includes(query)) && (status === 'all' || incident.status === status);
  });
}

function renderHumanReview() {
  const event = visible('videoEvents').find((item) => item.reviewStatus === 'pending');
  if (!event) return '';
  if (!canReviewVideoEvent(viewer(), event)) return '';
  return `<article class="portal-human-review"><header><div><p class="portal-record-id">${escapeHtml(event.id)}</p><h3>${escapeHtml(text.humanReview)}</h3></div><span class="portal-status is-pending">${escapeHtml(text.reviewPending)}</span></header><p>${escapeHtml(local(event.source))}</p><p class="portal-risk">${escapeHtml(local(event.risk))}</p><p>${escapeHtml(local(event.humanNote))}</p><p class="portal-control-note">${escapeHtml(text.videoBoundary)}</p><div class="portal-review-actions"><label><span class="screen-reader-text">${escapeHtml(text.humanReview)}</span><select data-video-decision="${event.id}"><option value="exclude">${escapeHtml(text.exclude)}</option><option value="follow">${escapeHtml(text.follow)}</option><option value="create-incident-after-review">${escapeHtml(text.createAfterReview)}</option></select></label><button class="portal-primary-button" type="button" data-action="review-video" data-event-id="${event.id}">${escapeHtml(text.decide)}</button></div></article>`;
}

function renderTasks() {
  const tasks = visible('tasks');
  if (!tasks.length) return boundary(text.noTasks);
  return `<div class="portal-task-list">${tasks.map((task) => `<article class="portal-task"><div><p class="portal-record-id">${escapeHtml(task.id)} · ${escapeHtml(text.task)}</p><h3>${escapeHtml(local(task.title))}</h3><p><span dir="ltr">${escapeHtml(task.due)}</span> · ${task.status === 'completed' ? escapeHtml(text.completedTasks) : escapeHtml(text.openTasks)}</p></div>${task.status === 'completed' ? `<span class="portal-status is-closed">${escapeHtml(text.completedTasks)}</span>` : `<div><button class="portal-primary-button" type="button" data-action="complete-task" data-task-id="${task.id}">${escapeHtml(text.complete)}</button><small>${escapeHtml(text.completeNote)}</small></div>`}</article>`).join('')}</div>`;
}

function findAuditRecord(recordId) {
  for (const entity of ['incidents', 'reports', 'tasks', 'videoEvents', 'drafts']) {
    if (state[entity]?.some((item) => item.id === recordId)) return { entity, record: find(entity, recordId) };
  }
  return null;
}

function visibleAudit() {
  if (activeRole === Roles.client) return [];
  return state.audit.filter((entry) => {
    if (activeRole === Roles.operations || entry.recordId === 'seed') return activeRole === Roles.operations;
    const found = findAuditRecord(entry.recordId);
    return found ? canReadEntity(state, viewer(), found.entity, found.record) : false;
  });
}

function renderAudit() {
  const entries = visibleAudit().slice(0, 6);
  if (!entries.length) return boundary(text.auditEmpty);
  return `<div class="portal-table-scroll" tabindex="0" role="region" aria-label="${escapeHtml(text.audit)}"><table class="portal-table"><caption>${escapeHtml(text.audit)}</caption><thead><tr><th>${escapeHtml(text.timestamp)}</th><th>${escapeHtml(text.actor)}</th><th>${escapeHtml(text.role)}</th><th>${escapeHtml(text.action)}</th><th>${escapeHtml(text.from)}</th><th>${escapeHtml(text.to)}</th></tr></thead><tbody>${entries.map((entry) => `<tr><td dir="ltr">${escapeHtml(entry.timestamp)}</td><td>${escapeHtml(entry.actor)}</td><td>${escapeHtml(roleName(entry.actorRole))}</td><td>${escapeHtml(entry.action)}</td><td>${escapeHtml(entry.from)}</td><td>${escapeHtml(entry.to)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderOverview() {
  const metrics = deriveMetrics(state, viewer());
  const client = activeRole === Roles.client;
  const notices = client ? boundary(text.clientBoundary, 'restricted') : boundary(text.escaped);
  return `${sectionHeader(text.overview, rtl ? 'مؤشرات نطاق العرض تتغير محليًا عند تنفيذ قائمة تحقق أو إجراء مسموح.' : 'Demo-scoped indicators change locally when a checklist or allowed action is completed.')}<div class="portal-metric-grid">${metric(text.sites, metrics.sites, rtl ? 'حسب عزل الدور' : 'Role-scoped')}${metric(text.openTasks, metrics.openTasks, rtl ? 'ذاكرة مؤقتة' : 'Temporary memory')}${metric(text.openIncidents, metrics.openIncidents, client ? '0' : rtl ? 'حالات غير مغلقة' : 'Non-closed states')}${metric(text.approvedReports, metrics.approvedReports, rtl ? 'مصرح بها فقط' : 'Authorized only')}</div>${notices}<section class="portal-panel"><h2>${escapeHtml(text.scope)}</h2>${scopeCards()}</section>${client ? `<section class="portal-panel"><h2>${escapeHtml(text.reports)}</h2>${renderReportsList()}</section>` : `<div class="portal-two-column"><section class="portal-panel"><h2>${escapeHtml(text.shifts)}</h2>${renderTasks()}</section><section class="portal-panel"><h2>${escapeHtml(text.incidents)}</h2>${visibleIncidents().slice(0, 2).map(incidentCard).join('') || boundary(text.noIncidents)}</section></div>${renderHumanReview()}<section class="portal-panel"><h2>${escapeHtml(text.audit)}</h2>${renderAudit()}</section>`}`;
}

function renderIncidents() {
  if (activeRole === Roles.client) return `${sectionHeader(text.incidents, text.clientBoundary)}${boundary(text.clientBoundary, 'restricted')}`;
  const currentViewer = viewer();
  const action = canCreateIncident(currentViewer, currentViewer.siteId || 'S01') || currentViewer.role === Roles.operations ? `<button type="button" class="portal-primary-button" data-action="open-incident-dialog">${escapeHtml(text.createIncident)}</button>` : '';
  return `${sectionHeader(text.incidents, rtl ? 'مسار الحالات: جديد ← فرز ← مسند ← محلول ← مغلق. لا يعتمد منشئ البلاغ مراجعته.' : 'State path: New → Triaged → Assigned → Resolved → Closed. A creator cannot approve their own review.', action)}<div class="portal-incident-list">${visibleIncidents().map(incidentCard).join('') || boundary(text.noIncidents)}</div><section class="portal-panel"><h2>${escapeHtml(text.audit)}</h2>${renderAudit()}</section>`;
}

function renderShifts() {
  if (activeRole === Roles.client) return `${sectionHeader(text.shifts, text.clientBoundary)}${boundary(text.restricted, 'restricted')}`;
  return `${sectionHeader(text.shifts, rtl ? 'تأكيد المهمة لا يغادر المتصفح ولا يستمر بعد إعادة التحميل.' : 'Task confirmation does not leave the browser and is reset on reload.')}<section class="portal-panel">${renderTasks()}</section>`;
}

function renderReportsList() {
  const reports = visible('reports');
  if (!reports.length) return boundary(text.noReports);
  return `<div class="portal-report-list">${reports.map((report) => `<article class="portal-report"><header><div><p class="portal-record-id">${escapeHtml(report.id)}</p><h3>${escapeHtml(local(report.title))}</h3></div><span class="portal-status is-${escapeHtml(report.status)}">${escapeHtml(report.status === 'approved' ? text.approved : text.draft)}</span></header><p>${escapeHtml(local(report.aggregate))}</p><small>${escapeHtml(report.visibility === 'client-aggregate' ? text.reportsNote : text.internal)}</small></article>`).join('')}</div>`;
}

function renderReports() {
  const description = activeRole === Roles.client ? text.clientBoundary : (rtl ? 'التقارير تعرض حالة العرض فقط؛ لا توجد مشاركة أو تصدير أو حفظ خارجي.' : 'Reports show demo state only; there is no sharing, export, or external persistence.');
  return `${sectionHeader(text.reports, description)}<section class="portal-panel">${renderReportsList()}</section>`;
}

function renderAssistant() {
  const incidents = visible('incidents');
  if (!incidents.length) return `${sectionHeader(text.assistant, text.assistantHonest)}${boundary(text.assistantHonest, 'restricted')}${boundary(text.noReadableIncident)}`;
  const options = incidents.map((incident) => `<option value="${incident.id}"${incident.id === selectedIncidentId ? ' selected' : ''}>${escapeHtml(incident.id)} — ${escapeHtml(local(incident.title))}</option>`).join('');
  const draft = latestDraft && incidents.some((incident) => incident.id === latestDraft.incidentId) ? `<article class="portal-draft"><p class="portal-record-id">${escapeHtml(latestDraft.id)} · ${escapeHtml(text.draft)}</p><h3>${escapeHtml(text.draftCreated)}</h3><p>${escapeHtml(local(latestDraft.summary))}</p></article>` : '';
  return `${sectionHeader(text.assistant, text.assistantHonest)}<section class="portal-assistant-panel"><div><p class="portal-warning-copy">${escapeHtml(text.assistantHonest)}</p><p>${escapeHtml(text.assistantEngine)}</p><p>${escapeHtml(text.futureAi)}</p></div><div class="portal-assistant-action"><label for="assistant-incident">${escapeHtml(text.selectIncident)}</label><select id="assistant-incident">${options}</select><button type="button" class="portal-primary-button" data-action="create-draft">${escapeHtml(text.assistantAction)}</button></div></section>${draft}`;
}

function renderIntegrations() {
  const states = [text.gcp, text.master, text.identity, text.vms];
  return `${sectionHeader(text.integrations, text.integrationNote)}<div class="portal-integration-grid">${states.map((item) => `<article class="portal-integration-card"><span class="portal-connection-dot" aria-hidden="true"></span><p>${escapeHtml(item)}</p></article>`).join('')}</div><section class="portal-panel portal-next-step"><div><p class="portal-eyebrow">${escapeHtml(text.nextStep)}</p><h2>${escapeHtml(text.nextStepText)}</h2></div><button type="button" class="portal-secondary-button" data-action="internal-next-step">${escapeHtml(text.nextStep)}</button></section>`;
}

const renderers = { overview: renderOverview, incidents: renderIncidents, shifts: renderShifts, reports: renderReports, assistant: renderAssistant, integrations: renderIntegrations };
function render() {
  refs.content.setAttribute('aria-busy', 'true');
  refs.content.innerHTML = renderers[activeSection]();
  refs.content.setAttribute('aria-busy', 'false');
  setActiveNavigation();
}

function openIncidentDialog(trigger) {
  const currentViewer = viewer();
  if (currentViewer.role === Roles.client) return announce(text.actionDenied);
  lastFocus = trigger;
  refs.error.hidden = true;
  refs.form.reset();
  const siteSelect = document.querySelector('#incident-site');
  Array.from(siteSelect.options).forEach((option) => { option.disabled = !canCreateIncident(currentViewer, option.value); });
  const firstAllowed = Array.from(siteSelect.options).find((option) => !option.disabled);
  if (firstAllowed) siteSelect.value = firstAllowed.value;
  refs.dialog.showModal();
  document.querySelector('#incident-title').focus();
}

function closeDialog() { if (refs.dialog.open) refs.dialog.close(); }
refs.dialog.addEventListener('close', () => { if (lastFocus?.isConnected) lastFocus.focus(); lastFocus = null; });
refs.dialog.addEventListener('cancel', () => { refs.error.hidden = true; });

function applyAction(button) {
  const action = button.dataset.action;
  try {
    if (action === 'open-incident-dialog') return openIncidentDialog(button);
    if (action === 'close-dialog') return closeDialog();
    if (action === 'select-incident') { selectedIncidentId = button.dataset.incidentId; announce(`${text.selected}: ${selectedIncidentId}`); return render(); }
    if (action === 'transition') { replaceState(transitionIncident(state, { viewer: viewer(), incidentId: button.dataset.incidentId, to: button.dataset.to })); announce(text.sectionUpdated); return render(); }
    if (action === 'approve-review') { replaceState(approveClosureReview(state, { viewer: viewer(), incidentId: button.dataset.incidentId })); announce(text.reviewApproved); return render(); }
    if (action === 'complete-task') { replaceState(completeChecklistTask(state, { viewer: viewer(), taskId: button.dataset.taskId })); announce(text.taskCompleted); return render(); }
    if (action === 'review-video') {
      const select = document.querySelector(`[data-video-decision="${button.dataset.eventId}"]`);
      replaceState(reviewVideoEvent(state, { viewer: viewer(), eventId: button.dataset.eventId, decision: select.value }));
      announce(text.videoRecorded); return render();
    }
    if (action === 'create-draft') {
      const incidentId = document.querySelector('#assistant-incident').value;
      const result = buildLocalRuleBasedDraft(state, { viewer: viewer(), incidentId });
      latestDraft = result.draft; replaceState(result.state); selectedIncidentId = incidentId; announce(text.draftCreated); return render();
    }
    if (action === 'internal-next-step') { announce(text.nextStepText); return; }
  } catch (error) { announce(text.actionDenied); }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) applyAction(button);
  const nav = event.target.closest('[data-section]');
  if (nav) { activeSection = nav.dataset.section; announce(text.sectionUpdated); render(); }
});

refs.role.addEventListener('change', () => { activeRole = refs.role.value; selectedIncidentId = null; latestDraft = null; activeSection = 'overview'; announce(text.roleUpdated); render(); });
refs.search.addEventListener('input', () => { if (activeSection === 'overview' || activeSection === 'incidents') render(); });
refs.filter.addEventListener('change', () => { if (activeSection === 'overview' || activeSection === 'incidents') render(); });
refs.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = document.querySelector('#incident-title');
  const detail = document.querySelector('#incident-detail');
  if (title.value.trim().length < 4) { refs.error.textContent = rtl ? 'أدخل عنوانًا من أربعة أحرف على الأقل.' : 'Enter a title with at least four characters.'; refs.error.hidden = false; title.focus(); return; }
  try {
    replaceState(createIncident(state, { viewer: viewer(), title: title.value, detail: detail.value, service: document.querySelector('#incident-service').value, siteId: document.querySelector('#incident-site').value }));
    closeDialog(); selectedIncidentId = state.incidents[0].id; activeSection = 'incidents'; announce(text.incidentCreated); render();
  } catch (error) { refs.error.textContent = text.actionDenied; refs.error.hidden = false; }
});

render();
