# تجهيز Staging على Google Cloud

هذه الملفات تعدّ خطة أوامر **للمراجعة فقط** ولا تنفذ Google Cloud أو تمنح صلاحيات أو تربط حساب فوترة. يبقى المشروع والـDNS وقاعدة الإنتاج دون تعديل. إنشاء الموارد والنشر الفعليان لا يعتبران مكتملين بمجرد وجود هذه الخطة.

## قراءة الخطة

```bash
STAGING_REGION=me-central1 STAGING_NETWORK=fursan-staging-vpc STAGING_SUBNET=fursan-staging-doha node infra/staging/plan-staging.mjs
STAGING_REGION=me-central1 STAGING_NETWORK=fursan-staging-vpc STAGING_SUBNET=fursan-staging-doha STAGING_PROJECT_ID=fursan-alamn-staging STAGING_PROJECT_NUMBER=YOUR_PROJECT_NUMBER node infra/staging/plan-staging.mjs
```

المعرف الافتراضي `fursan-alamn-staging`؛ يرفض المولد أي معرف لا يطابق اسم مشروع اختبار، ويرفض رقم المشروع غير الرقمي. لا يختار منطقة افتراضية؛ يلزم تحديد منطقة متاحة ومعتمدة صراحة. أزيل منع الدمام القديم بعد تغيير المالك للفوترة وإظهارها في قائمة Cloud Run، لكن وجود خيار `me-central2` وطباعة خطة له لا يثبتان نجاح النشر فيه. استبدل `YOUR_PROJECT_NUMBER` بالرقم الفعلي قبل تشغيل المثال الثاني؛ هو موضع بديل وليس رقمًا صالحًا. تستبدل أيضًا `REVIEWED_COMMIT_SHA` و`APPROVED_ORGANIZATION_EMAIL` بالقيم المعتمدة، ولا تنفذ قائمة مواضع بديلة كما هي.

أسماء الشبكة وSubnet مطلوبة صراحة وتبدأ بـ`fursan-staging-`؛ يرفض أسماء الإنتاج وحقن الأوامر. يجب أن تكون الشبكة وSubnet المعتمدتان موجودتين في مشروع الاختبار والمنطقة نفسها قبل النشر. إنشاء الشبكة يحتاج اعتمادًا محددًا مستقلًا إن لم يكن ضمن القرار الأول؛ لا ينشئ المولد شبكة أو يختار شبكة default تلقائيًا، ولا يعدّل سياسة المنظمة.

مثال **لطباعة خطة الدمام فقط** بعد اعتماد المنطقة ووجود مواردها:

```bash
STAGING_REGION=me-central2 STAGING_NETWORK=fursan-staging-vpc STAGING_SUBNET=fursan-staging-dammam node infra/staging/plan-staging.mjs
```

نقل حساب الفوترة لا ينقل Subnet أو bucket أو مستودع الصور الإقليمي. لا تستخدم `fursan-staging-doha` لنشر الدمام، ولا تحذف موارد منطقة سابقة تلقائيًا. يلزم قرار إقليمي واعتماد الموارد الجديدة إن كان البيان السابق يحدد الدوحة.

## مسار التنفيذ بعد الاعتماد

| الخطوة | شرط التقدم |
|---|---|
| مشروع منفصل | التحقق من منظمة المالك والمعرف الفعلي وحساب الفوترة المختار؛ عدم تغيير أي مشروع موجود |
| APIs وهويات ومخزن صور | اعتماد الهويات والأدوار والموارد المحددة؛ أقل صلاحيات على المورد، بلا Owner لحسابات التشغيل |
| حزمة المصدر | اختبارات ناجحة وإصدار مراجعة معلوم؛ استبعاد ملفات البيئة ووثائق الشركة/Apple وأي بيانات أو مفاتيح |
| بناء الصورة | حساب بناء خاص؛ قراءة source bucket فقط ورفع إلى مستودع صور الاختبار وكتابة سجلات البناء |
| الشبكة | شبكة اختبار مخصصة وSubnet بالمنطقة نفسها مع Private Google Access، وفحص CIDR؛ Direct VPC بإعداد `private-ranges-only`، دون مشاركة الإنتاج |
| الموصل الخاص | Cloud Run IAM، `BRIDGE_RECEIVER_ENABLED=false` و`FURSAN_MASTER_SYNC=disabled`؛ لا صلاحيات Master أو حفظ غير مثبت |
| الموقع | IAP ومستخدم معاينة معتمد؛ لا allUsers؛ نموذج الطلب غير مفعل للحفظ الفعلي |
| قبول Staging | فحص حساب المعاينة والأصول واللغات والجوال وحماية API والفهرسة؛ لا بيانات حقيقية |

اختيرت الدوحة (`me-central1`) أولًا للاختبار، ثم غيّر المالك حساب الفوترة وأصبح خيار الدمام ظاهرًا. يبقى الانتقال الإقليمي قرارًا مستقلًا، ولا تنقل بيانات Master الإنتاجية إلى أي منطقة ضمن هذه الخطة. إعداد توسع النسخة حد أدنى صفر وحد أقصى instance واحدة، 1 CPU و512 MiB ومهلة 30 ثانية؛ ليس سقف إنفاق مضمونًا. أُضيفت شبكة Staging المخصصة باعتماد منفصل؛ لا Cloud SQL جديد أو VM أو NAT أو connector دائم أو موزع تحميل. إعداد `private-ranges-only` يوجه النطاقات الخاصة عبر VPC فقط، ولا يحصر الإنترنت كله بها.

إعداد IAM على الخدمة الخاصة يجعلها مقيدة بالصلاحيات، **ولا يجعل عنوان HTTPS شبكة VPC داخلية**. يشترط دعم IAP في بيئة المنظمة؛ إن ظهر قيد تنظيمي أو طلب أدوار إضافية، يتوقف التنفيذ ويُعرض على المالك بدل تعطيل الحماية أو توسيع الصلاحيات. لا يتجاوز المولد أو سياسة المنصة أي حماية للمنظمة.

## التمييز بين الموقع وMaster

الموقع لا يحصل على Sheets/SQL credentials. الجسر يحضر عقد استقبال فقط، ولا يزامن Master أو يسمح باستعلام عام. مخزن استقبال اختبار دائم ومخطط Master ومصدرها الفعلي تُراجع وتُعتمد قبل تمكين أي حفظ. راجع [عقد الجسر المحمي](../../docs/secure-master-bridge.md) و[دليل Google Cloud والبيانات](../../docs/google-cloud-and-database.md).

النسخة الحالية تبقى مبنية على المصدر المعتمد؛ تجهيز الاستضافة لا يطبق أصولًا بصرية جديدة ولا يدمج main تلقائيًا. أي تغيير إنتاجي أو مشاركة قاعدة أو إضافة صلاحيات غير معتمدة يحتاج قرارًا منفصلًا.

## المراجع الرسمية

- [Cloud Run: المصادقة بين الخدمات](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Cloud Run: IAP للمستخدمين](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run)
- [الاعتماد المسبق لهوية الخدمة](https://docs.cloud.google.com/docs/authentication/application-default-credentials)
- [Direct VPC egress](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)
