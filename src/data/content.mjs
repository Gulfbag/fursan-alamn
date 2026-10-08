const siteOrigin = new URL(process.env.SITE_ORIGIN || 'https://www.fapc.sa');
if (siteOrigin.protocol !== 'https:' || siteOrigin.pathname !== '/' || siteOrigin.search || siteOrigin.hash || siteOrigin.username || siteOrigin.password) throw new Error('SITE_ORIGIN must be an HTTPS origin without a path or credentials');

export const company = {
  origin: siteOrigin.origin,
  ar: 'شركة فرسان الأمن للحماية', en: 'Fursan Al Amn Security',
  phone: '+966 11 494 3628', phoneLink: '+966114943628', whatsapp: '966553338111',
  email: 'info@fursanalamn.com', nationalNumber: '7051667330', vat: '314231506100003',
  license: '2611000035', licenseExpiry: '2027-08-05', dataRegistration: '3260008478',
  jadir: '33411000000', ecommerce: '0000330996', ecommerceExpiry: '2027-09-16',
  address: { ar: 'الرياض، حي الروضة، شارع حفصة بنت عمر، مبنى 3308، الرمز البريدي 13211', en: 'Building 3308, Hafsa Bint Omar Street, Al Rawdah, Riyadh 13211, Saudi Arabia' },
  social: { linkedin: 'https://www.linkedin.com/company/fursan-alamn', x: 'https://x.com/fursanalamn' }
};

export const services = [
  { id: 'monitoring', icon: 'monitor-check', ar: 'مركز المراقبة والتحكم', en: 'Monitoring & control',
    intro: { ar: 'تنسيق المتابعة والتنبيهات والتقارير بين الموقع وفريق العمليات، ضمن نطاق يتم الاتفاق عليه لكل مشروع.', en: 'Coordinate site monitoring, alerts and reporting with the operations team under an agreed project scope.' },
    items: { ar: ['تحديد المواقع ونطاق التغطية وساعات المتابعة المطلوبة.', 'توصيف آلية فرز التنبيهات والتصعيد والمراجعة البشرية.', 'تحديد التقارير والمسؤوليات ومؤشرات الخدمة في العرض.', 'مراجعة قابلية التكامل مع الأنظمة القائمة قبل الالتزام بالتنفيذ.'], en: ['Define sites, coverage and required monitoring hours.', 'Agree alert triage, escalation and human review procedures.', 'Specify reports, responsibilities and service indicators in the proposal.', 'Assess existing-system integration before committing to delivery.'] },
    need: { ar: 'نوع المنشأة وعدد المواقع وساعات المتابعة والأنظمة المتاحة، دون مشاركة كلمات مرور أو بث كاميرات في النموذج.', en: 'Facility type, site count, monitoring hours and existing systems. Do not share passwords or camera feeds in this form.' } },
  { id: 'events', icon: 'users', ar: 'أمن الفعاليات', en: 'Event security',
    intro: { ar: 'تخطيط التغطية الأمنية للفعاليات بما يتناسب مع المكان وعدد الحضور وطبيعة التنظيم.', en: 'Plan event security coverage around the venue, attendance and operational requirements.' },
    items: { ar: ['مراجعة نطاق الفعالية والوقت المتوقع وأعداد الحضور.', 'تحديد نقاط الدخول والخروج وتوزيع الأدوار.', 'تحديد آلية التنسيق مع فريق التنظيم والجهات المختصة عند الحاجة.', 'الاتفاق على تقارير الملاحظات والتصعيد بعد الفعالية.'], en: ['Review event scope, schedule and expected attendance.', 'Define entrances, exits and team responsibilities.', 'Agree coordination with organizers and competent authorities where needed.', 'Specify incident reporting and post-event observations.'] },
    need: { ar: 'المدينة وتاريخ الفعالية ومدتها وعدد الحضور المتوقع وطبيعة الموقع.', en: 'City, event date and duration, expected attendance and venue type.' } },
  { id: 'guarding', icon: 'shield-check', ar: 'الحراسات الأمنية', en: 'Security guarding',
    intro: { ar: 'خدمة حراسة أمنية مدنية خاصة تحت ترخيص الفئة الأولى، مع تحديد احتياج كل موقع وخطة التغطية.', en: 'Private civil security guarding under a first-category license, with site-specific requirements and coverage planning.' },
    items: { ar: ['مراجعة احتياجات المنشأة ومواقع الحراسة.', 'تحديد الورديات والأدوار ونقاط التغطية في العرض.', 'إجراءات متابعة الحضور والملاحظات والتصعيد المتفق عليها.', 'تحديد مسؤوليات العميل ومقدم الخدمة وآلية مراجعة الأداء.'], en: ['Assess facility requirements and guarding positions.', 'Define shifts, roles and coverage in the proposal.', 'Agree attendance, observation and escalation procedures.', 'Specify client and provider responsibilities and performance review.'] },
    need: { ar: 'عدد المواقع والمدينة وساعات التغطية وتاريخ البدء المتوقع. تحدد أعداد الأفراد بعد تقييم الاحتياج.', en: 'Site count, city, coverage hours and expected start date. Personnel requirements follow the needs assessment.' } },
  { id: 'cash', icon: 'banknote', ar: 'نقل الأموال والمعادن الثمينة', en: 'Cash & valuables transport',
    intro: { ar: 'مسار استفسار لتقييم احتياج نقل الأموال والمعادن والمستندات ذات القيمة وتحديد متطلبات تنفيذ الخدمة.', en: 'An inquiry route to assess cash, valuables and sensitive-document transport requirements.' },
    items: { ar: ['تحديد نوع المهمة ونطاقها دون الإفصاح عن المسارات أو المبالغ في النموذج العام.', 'مراجعة متطلبات التراخيص والتأمين والنطاق المتاح قبل تقديم الالتزام.', 'تحديد إجراءات التسليم والاستلام والعهدة ضمن العرض المتخصص.', 'تبادل التفاصيل الحساسة لاحقًا عبر قناة معتمدة.'], en: ['Outline the assignment without disclosing routes or cash amounts in the public form.', 'Review licensing, insurance and available scope before a commitment.', 'Agree handover and chain-of-custody procedures in the specialist proposal.', 'Exchange sensitive details later through an approved channel.'] },
    need: { ar: 'المدينة ونوع الخدمة ووسيلة الاتصال فقط؛ لا ترفق تفاصيل مالية أو مسارات نقل.', en: 'City, service type and contact details only. Do not include financial details or transport routes.' } },
  { id: 'vip', icon: 'user-shield', ar: 'الحماية الشخصية', en: 'Personal protection',
    intro: { ar: 'استفسارات حماية الأفراد وكبار الشخصيات لتقييم نطاق الاحتياج والمتطلبات النظامية والتشغيلية.', en: 'Personal and VIP protection inquiries for operational and regulatory scope assessment.' },
    items: { ar: ['تحديد نوع الاحتياج والمدة بصورة عامة.', 'مراجعة نطاق تقديم الخدمة والمتطلبات النظامية قبل التأكيد.', 'تحديد آلية التنسيق والمسؤوليات في العرض.', 'مشاركة تفاصيل الأشخاص والتنقلات عبر قناة خاصة بعد التواصل.'], en: ['Provide a general description and duration.', 'Confirm service scope and regulatory requirements before acceptance.', 'Specify coordination and responsibilities in the proposal.', 'Share personal and movement details privately after initial contact.'] },
    need: { ar: 'المدينة والمدة المتوقعة ووسيلة الاتصال؛ لا تشارك بيانات هوية أو جدول تنقلات في الموقع.', en: 'City, expected duration and contact information. Do not share identity documents or movement schedules here.' } }
];

export const sectors = [
  ['القطاع الحكومي', 'Government', 'تحديد نطاق الحراسة والتنسيق ومتطلبات المشروع.', 'Define guarding, coordination and project requirements.', 'landmark'],
  ['البنوك والخدمات المالية', 'Financial services', 'تقييم متطلبات الحراسة والمهمات المتخصصة.', 'Assess guarding and specialist assignment requirements.', 'building-2'],
  ['التجزئة والمراكز التجارية', 'Retail', 'تخطيط التغطية للمداخل والمرافق وأوقات التشغيل.', 'Plan coverage for entrances, facilities and trading hours.', 'shopping-bag'],
  ['الصناعة والخدمات اللوجستية', 'Industry & logistics', 'مراجعة بيئة الموقع والورديات وآلية التصعيد.', 'Review site conditions, shifts and escalation.', 'factory'],
  ['الفعاليات والترفيه', 'Events & entertainment', 'تخطيط الانتشار وتنظيم الدخول حسب الفعالية.', 'Plan deployment and access for each event.', 'ticket'],
  ['العقارات والضيافة', 'Property & hospitality', 'تنسيق الحراسة بحسب طبيعة المنشأة.', 'Coordinate coverage around facility requirements.', 'hotel']
];

export const articles = [
  { slug: 'choosing-security-provider', category: 'guarding', date: '2026-10-08',
    title: { ar: 'كيف تختار شريك الحراسة الأمنية؟', en: 'Choosing a security guarding partner' },
    excerpt: { ar: 'خطوات عملية للتحقق من الترخيص وتحديد النطاق وقراءة عرض الخدمة.', en: 'Practical steps for checking the license, defining the scope and reviewing a proposal.' },
    sections: { ar: [
      ['ابدأ بالنطاق لا بعدد الأفراد', 'حدد طبيعة الموقع وساعات العمل ونقاط الدخول والمسؤوليات المطلوبة. عدد الأفراد نتيجة لتقييم الاحتياج، وليس بديلًا عن خطة واضحة.'],
      ['تحقق من الترخيص', 'اطلب بيانات الترخيص ومدته ونوع النشاط ونطاقه. فئة الترخيص لا تعني بالضرورة عدد الأفراد العاملين حاليًا، ولا تثبت اعتماد كل خدمة أخرى يعلن عنها مقدم الخدمة.'],
      ['اقرأ العرض بوصفه اتفاق تشغيل', 'يجب أن يوضح العرض الورديات والأدوار وآلية الإحلال والتصعيد والتقارير ومسؤوليات الطرفين. اطلب تفسيرًا لأي بند عام لا يحدد ما سيتم تسليمه.'],
      ['قارن الأدلة لا الشعارات', 'راجع الوثائق السارية وأمثلة التقارير والحالات المصرح بعرضها. أي أرقام تشغيلية أو شهادات جودة تحتاج مصدرًا وتاريخًا ونطاقًا واضحًا.']
    ], en: [
      ['Start with the scope', 'Describe the site, operating hours, entrances and required responsibilities. Personnel numbers should follow a needs assessment, not replace a clear plan.'],
      ['Check the license', 'Request the license details, validity, activity and scope. A license category is not necessarily current headcount and does not prove authorization for every other advertised service.'],
      ['Read the proposal as an operating agreement', 'The proposal should explain shifts, roles, replacement arrangements, escalation, reporting and each party’s responsibilities. Clarify general commitments that do not specify deliverables.'],
      ['Compare evidence', 'Review valid documents, sample reports and authorized case studies. Operating figures and quality certifications need a source, date and clear scope.']
    ] } },
  { slug: 'incident-reporting', category: 'operations', date: '2026-10-08',
    title: { ar: 'ما الذي يجعل تقرير الملاحظة الأمنية مفيدًا؟', en: 'What makes a security observation report useful?' },
    excerpt: { ar: 'معلومات أساسية تساعد على المتابعة دون جمع بيانات حساسة أكثر من اللازم.', en: 'Essential information for follow-up without collecting unnecessary sensitive data.' },
    sections: { ar: [
      ['وقائع قابلة للمراجعة', 'يسجل التقرير وقت الملاحظة ومكانها ووصف ما شوهد والإجراء المتخذ، ويميز بوضوح بين الوقائع والتفسير. تجنب استنتاج نوايا الأشخاص دون دليل.'],
      ['مسؤولية وحالة واضحة', 'حدد من استلم الملاحظة وما إذا كانت مفتوحة أو قيد المعالجة أو مغلقة. الإغلاق يجب أن يرتبط بإجراء مسجل لا بمجرد مرور الوقت.'],
      ['حدود مشاركة المعلومات', 'تقتصر الصور والبيانات الشخصية على ما تتطلبه المهمة وتسمح به إجراءات العميل. لا تنشر تقارير أو صور منشآت في قنوات عامة، وحدد صلاحيات الاطلاع.'],
      ['مراجعة دورية', 'راجع الأنماط المتكررة وجودة الاستجابة مع العميل، وحدد مؤشرات قابلة للتفسير بدل الاكتفاء بعدد الملاحظات.']
    ], en: [
      ['Reviewable facts', 'Record the time, location, observed facts and action taken. Distinguish observation from interpretation and avoid assuming intent without evidence.'],
      ['A clear owner and status', 'Identify who received the report and whether it is open, in progress or closed. Closure should refer to a recorded action.'],
      ['Controlled information sharing', 'Collect only the images and personal information needed and permitted by the client’s procedures. Do not publish site reports publicly; control access.'],
      ['Regular review', 'Review recurring patterns and response quality with the client, using interpretable indicators rather than report counts alone.']
    ] } },
  { slug: 'human-review-ai', category: 'technology', date: '2026-10-08',
    title: { ar: 'المراجعة البشرية في التنبيهات الأمنية الذكية', en: 'Human review of intelligent security alerts' },
    excerpt: { ar: 'لماذا يظل التنبيه إشارة تحتاج تقييمًا بشريًا وإجراءات محددة؟', en: 'Why an alert remains a signal requiring human assessment and defined procedures.' },
    sections: { ar: [
      ['التنبيه ليس قرارًا', 'يمكن للتحليل الآلي إبراز حدث للمراجعة، لكنه لا يثبت بمفرده وجود مخالفة أو خطر. يراجع شخص مخول سياق الحدث قبل اعتماد الإجراء.'],
      ['اختبر بحسب بيئة الموقع', 'الإضاءة والزوايا والحركة وطبيعة الموقع تؤثر في جودة التنبيهات. تحدد حالات الاستخدام ويجرى اختبارها قبل تعميم أي وعد بالأداء.'],
      ['احتفظ بأثر القرار', 'سجل وقت التنبيه والمراجع والنتيجة والإجراء وفق الصلاحيات المعتمدة. تساعد هذه المعلومات على مراجعة الأخطاء والتحسين دون إسناد المسؤولية لنظام آلي.'],
      ['قلل البيانات والصلاحيات', 'حدد الغرض من المعالجة وفترة الاحتفاظ والجهات المخولة بالاطلاع. حماية المعلومات جزء من تصميم الخدمة وليس إضافة لاحقة.']
    ], en: [
      ['An alert is not a decision', 'Automated analysis can surface an event, but does not by itself establish a violation or threat. An authorized person reviews the context before action.'],
      ['Test for the site', 'Lighting, camera angles, motion and site conditions affect alert quality. Define and test use cases before making performance commitments.'],
      ['Keep a decision record', 'Record the alert time, reviewer, outcome and action under approved access rules. These records support review and improvement.'],
      ['Limit data and access', 'Define the processing purpose, retention period and authorized users. Information protection belongs in the service design.']
    ] } }
];
