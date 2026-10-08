# مراجعة تفعيل النواة

`plan-activation.mjs` يطبع **خطة فقط**؛ لا يستدعي gcloud ولا يغير IAM أو قاعدة أو فوترة. لا تنفذ عند تعليق حساب الفوترة أو ظهور رفض صلاحيات/سياسة. يجب أن يؤكد المالك حالة القاعدة التي أنشأها؛ نموذج Cloud SQL في مشروع الإنتاج ليس بديلًا.

```bash
STAGING_PROJECT_NUMBER=000000000000 \
OPS_ADMIN_EMAIL=approved-admin@example.sa \
OPS_IMAGE_DIGEST=me-central2-docker.pkg.dev/fursan-alamn-staging/fursan-staging/website@sha256:REPLACE_WITH_64_HEX_DIGEST \
node infra/operations/plan-activation.mjs
```

المدخلات معرف مشروع موثق وبريد IAP **معتمد مستقلاً** وصورة immutable اجتازت الاختبارات. تبديل بريد التواصل بالموقع لا يغير هوية المدير. الخطة تقبل فقط `fursan-alamn-staging` و`fursan-operations-staging` و`me-central2`، وتضيف `roles/datastore.user` فقط لهوية الموقع بشرط مورد القاعدة المطابق؛ لا human Owner/Editor أو allUsers أو مفتاح أو AI أو Master. شرط IAM ينفذ SDK/REST وليس تصفح Console حسب مرجع Google.

تحقق أولًا من القاعدة Standard Native/الدمام والفوترة الفعالة وحماية الحذف وPITR، ثم الإذن والمصدر وصورة جديدة من فرع مراجعة. تحديث الخدمة القائمة يحتفظ بهوية IAP والشبكة ولا ينشر الإنتاج. لا تعلن الحفظ اعتمادًا على healthz؛ أكمل قبول SDK/ADC ببيانات مصطنعة وإعادة تحميل وتكرار key وتعارض النسخ وسجل الاعتماد.

[دليل النواة](../../docs/paperless-operations.md) — [Google: per-database IAM](https://docs.cloud.google.com/firestore/native/docs/manage-databases#configure-per-database-access-permissions).
