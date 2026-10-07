export const portalSeed = Object.freeze({
  roleContexts: {
    operations: { role: 'operations', actorId: 'OP01', label: 'مستخدم العمليات التجريبي' },
    supervisor: { role: 'supervisor', actorId: 'SV01', siteId: 'S01', label: 'المشرف التجريبي — الموقع أ' },
    guard: { role: 'guard', actorId: 'GD01', siteId: 'S01', label: 'الحارس التجريبي — الموقع أ' },
    client: { role: 'client', actorId: 'CL01', contractId: 'C01', label: 'ممثل العميل التجريبي أ' },
  },
  sites: [
    { id: 'S01', contractId: 'C01', name: { ar: 'الموقع التجريبي أ', en: 'Demo Site A' }, zone: { ar: 'نطاق عرض تشغيلي', en: 'Operational demo zone' } },
    { id: 'S02', contractId: 'C02', name: { ar: 'الموقع التجريبي ب', en: 'Demo Site B' }, zone: { ar: 'نطاق عرض تشغيلي', en: 'Operational demo zone' } },
  ],
  contracts: [
    { id: 'C01', client: { ar: 'العميل التجريبي أ', en: 'Demo Customer A' }, scope: { ar: 'حراسة ميدانية — عرض', en: 'Field guarding — demo' } },
    { id: 'C02', client: { ar: 'العميل التجريبي ب', en: 'Demo Customer B' }, scope: { ar: 'متابعة محيطية — عرض', en: 'Perimeter monitoring — demo' } },
  ],
  incidents: [
    { id: 'I-401', siteId: 'S01', contractId: 'C01', title: { ar: 'تأخر تحقق نقطة دخول', en: 'Entry-point check delay' }, service: 'guarding', serviceDate: '2026-10-08', status: 'new', creatorId: 'GD01', creatorRole: 'guard', closureProposal: false, reviewStatus: 'not_requested' },
    { id: 'I-402', siteId: 'S01', contractId: 'C01', title: { ar: 'ملاحظة محيطية بانتظار الإسناد', en: 'Perimeter observation awaiting assignment' }, service: 'guarding', serviceDate: '2026-10-08', status: 'triaged', creatorId: 'GD01', creatorRole: 'guard', closureProposal: false, reviewStatus: 'not_requested' },
    { id: 'I-403', siteId: 'S02', contractId: 'C02', title: { ar: 'معالجة مسار زيارة مجدولة', en: 'Scheduled visit route correction' }, service: 'operations', serviceDate: '2026-10-08', status: 'resolved', creatorId: 'OP01', creatorRole: 'operations', closureProposal: true, reviewStatus: 'pending' },
    { id: 'I-404', siteId: 'S02', contractId: 'C02', title: { ar: 'مراجعة إغلاق تجريبية مكتملة', en: 'Completed demo closure review' }, service: 'operations', serviceDate: '2026-10-08', status: 'closed', creatorId: 'SV02', creatorRole: 'supervisor', closureProposal: true, reviewStatus: 'approved', reviewerId: 'OP02' },
  ],
  videoEvents: [
    {
      id: 'V-301', siteId: 'S01', contractId: 'C01', serviceDate: '2026-10-08', source: { ar: 'إشارة فيديو محيطية', en: 'Perimeter video signal' },
      risk: { ar: 'غير مؤكد؛ لا وجوه ولا خطر فردي', en: 'Unconfirmed; no faces or individual risk' },
      humanNote: { ar: 'ملاحظة بشرية أولية: يلزم قرار مراجع مخول قبل أي بلاغ.', en: 'Initial human note: an authorized reviewer must decide before any incident.' },
      incidentTitle: { ar: 'بلاغ محتمل بعد مراجعة إشارة فيديو محيطية', en: 'Potential incident after perimeter-video review' },
      reviewStatus: 'pending',
    },
  ],
  reports: [
    { id: 'R-101', siteId: 'S01', contractId: 'C01', title: { ar: 'تقرير مراجعة الخدمة — تجريبي', en: 'Service review report — demo' }, status: 'approved', visibility: 'client-aggregate', aggregate: { ar: 'ملخص مؤشرات خدمة مصرح بها للعقد C01 فقط.', en: 'Authorized aggregate service indicators for contract C01 only.' } },
    { id: 'R-102', siteId: 'S02', contractId: 'C02', title: { ar: 'مسودة تقرير تشغيل داخلي', en: 'Internal operations report draft' }, status: 'draft', visibility: 'internal', aggregate: { ar: 'غير منشور للعميل.', en: 'Not published to client.' } },
  ],
  tasks: [
    { id: 'T-101', siteId: 'S01', contractId: 'C01', title: { ar: 'قائمة تحقق افتتاح النوبة', en: 'Shift-opening checklist' }, status: 'open', due: '2026-10-08' },
    { id: 'T-102', siteId: 'S02', contractId: 'C02', title: { ar: 'مراجعة تغطية المسار', en: 'Route coverage review' }, status: 'completed', due: '2026-10-08' },
  ],
  drafts: [],
  audit: [
    { id: 'AUD-003', timestamp: '2026-10-08T08:03:00Z', actor: 'النظام التجريبي', actorRole: 'system', action: 'report_approved', from: 'draft', to: 'approved', recordId: 'R-101' },
    { id: 'AUD-002', timestamp: '2026-10-08T08:02:00Z', actor: 'مراجع تجريبي', actorRole: 'supervisor', action: 'incident_triaged', from: 'new', to: 'triaged', recordId: 'I-402' },
    { id: 'AUD-001', timestamp: '2026-10-08T08:01:00Z', actor: 'النظام التجريبي', actorRole: 'system', action: 'demo_seed_loaded', from: '—', to: 'memory', recordId: 'seed' },
  ],
});
