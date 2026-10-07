# ربط Google Cloud وقاعدة طلبات الموقع

> **حالة هذا المستودع:** يبقى الموقع ثابتاً وقابلاً للاستضافة على GitHub Pages. واجهة Node أدناه تجهيز اختياري لـ Cloud Run لاحقاً؛ لا يوجد في المستودع `Spreadsheet ID` أو بيانات اعتماد أو صلاحيات Google Cloud أو اتصال فعلي بقاعدة بيانات.

## قرار الربط وحدوده

تظهر صورة **Fursan-Master-Database** ملف Google Sheets مرتبطاً بـ Apps Script، لكنها لا تثبت معرف الملف أو المخطط أو هوية الخدمة أو صلاحيات الكتابة. لذلك لا يُفعل `LEAD_SINK=sheets` قبل اعتماد مالك البيانات للآتي:

1. **مشروع Google Cloud**، والمنطقة المناسبة بعد التحقق من الإتاحة الفعلية في السعودية؛ لا تفترض هذه الوثيقة أن منطقة بعينها متاحة أو أن اختيار منطقة يحقق التزامات قانونية.
2. **هوية وقت تشغيل** لـ Cloud Run ومراجعة مسؤول البيانات لصلاحية الوصول.
3. **Spreadsheet ID لصندوق استقبال مستقل** عن ملف قاعدة الشركة، وتبويب مخصص اسمه `Website_Leads` ومخططه التالي حرفياً. هذه هي التوصية الافتراضية لحماية بيانات التشغيل.
4. اختيار سير العمل: append إلى ملف الطلبات المستقل، ثم مزامنة خادمية مضبوطة إلى Fursan-Master-Database عبر Apps Script خاص أو خدمة تكامل بعد مراجعتها. التنفيذ الحالي يدعم **append المباشر فقط إلى ملف يحدده المالك** ولا ينشئ/يستدعي Apps Script أو ينفذ المزامنة. الكتابة المباشرة إلى الملف الرئيسي خيار استثنائي يحتاج قبول مخاطر صلاحيات الملف كاملة.
5. نص وسياسة الخصوصية، ونسخة موافقة `FURSAN_CONSENT_VERSION`، وقرار مدة الاحتفاظ وإجراءات الوصول والحذف والتعامل مع الطلبات.

لا ينشئ الخادم tab أو spreadsheet، ولا يقرأ قاعدة البيانات كاملة، ولا يكتب أي صف قبل اكتمال الإعداد ونجاح append صريح.

## متغيرات وقت التشغيل

انسخ القيم كإعدادات Cloud Run/Secret Manager بعد اعتمادها؛ لا تضعها في JavaScript المتصفح أو في Git. الملف [`.env.example`](../.env.example) مثال بلا أسرار.

| المتغير | الحالة/القيمة | الغرض |
|---|---|---|
| `PORT` | `8080` افتراضياً | منفذ Node؛ Cloud Run يحدده عادة. |
| `LEAD_SINK` | `disabled` أو `sheets` | `disabled` هو الآمن افتراضياً. |
| `APP_ORIGIN` | origin كامل، مثل `https://www.example.sa` | إلزامي في وضع Sheets؛ يجب أن يطابق `Origin` تماماً ولا يتضمن مساراً. |
| `FURSAN_SPREADSHEET_ID` | قيمة معتمدة لاحقاً | معرف الملف، ولا يعود في أي API عام. |
| `FURSAN_LEADS_SHEET` | `Website_Leads` | تبويب مخصص إلزامي؛ لا تسمح الخدمة باسم آخر. |
| `FURSAN_CONSENT_VERSION` | `2026-10-privacy-v1` افتراضياً | النسخة المخزنة مع كل موافقة بعد مراجعة السياسة. |
| `LEAD_RATE_LIMIT` | `8` افتراضياً | محاولات النافذة لكل عملية Node. |
| `LEAD_RATE_WINDOW_MS` | `60000` افتراضياً | طول نافذة المحدد بالميلي ثانية. |

لا تستخدم `GOOGLE_APPLICATION_CREDENTIALS` أو ملف مفتاح Service Account JSON في الحاوية. تستخدم الخدمة **Application Default Credentials (ADC)** في وقت التشغيل فقط، بنطاق Google Sheets `https://www.googleapis.com/auth/spreadsheets`.

## تبويب Google Sheets المعتمد

ينشئ المالك يدوياً التبويب **`Website_Leads`** ويضع صف العناوين هذا بالترتيب قبل التفعيل. هذا عقد بيانات صريح، وليس استنتاجاً من الصورة:

```text
requestId,createdAt,name,company,phone,email,service,city,sites,startDate,message,locale,sourcePage,consentVersion,status
```

يستعمل الخادم طلب Google Sheets `values.append` مع `valueInputOption=RAW` و`insertDataOption=INSERT_ROWS`. اختيار `RAW` يمنع تفسير قيم العميل كصيغ Sheets. لا توجد إعادة محاولة append تلقائية عند فشل شبكة أو استجابة ملتبسة، لأن الصف قد يكون كُتب بالفعل. النجاح HTTP 201 لا يحدث إلا إن أعادت API قيمة `updatedRows` مساوية تماماً لـ `1`.

`requestId` يساعد فريق التشغيل في التسوية اليدوية لاحقاً، لكنه **ليس ضمان idempotency موزعاً** ولا توجد آلية deduplication بين نسخ Cloud Run في هذا الإصدار.

## عقد HTTP

### `GET /healthz`

يعيد `200` و`{"status":"ok"}`. لا يختبر Google Sheets ولا يكشف جاهزية بيانات الاعتماد.

### `GET /api/public-config`

يعيد هذين الحقلين فقط ولا يكشف المعرفات أو الأخطاء الداخلية:

```json
{"leadSubmissionEnabled": false, "mode": "disabled"}
```

في الإعداد المكتمل فقط تكون القيمة `{"leadSubmissionEnabled":true,"mode":"sheets"}`. على واجهة الموقع استخدام `503` أو هذه الحالة للرجوع إلى WhatsApp **بشكل صريح**؛ لا يجوز عرض نجاح حفظ وهمي.

### `POST /api/leads`

- يقبل `Content-Type: application/json` فقط، والجسم بحد أقصى **8 KiB**.
- عند ضبط `APP_ORIGIN`، يجب أن يساوي ترويسة `Origin` هذا الـ origin بالضبط.
- لا يقبل إلا عقد الواجهة التالي: `{name,company,phone,email,service,city,sites,startDate,message,consent,website,locale,sourcePage}`.
- `website` honeypot يجب أن يكون فارغاً، ولا تمرر الحقول غير المتوقعة إلى التخزين.
- `sourcePage` مسار نسبي من قائمة صريحة في `server/config.mjs` تشمل `/quote.html` و`/en/quote.html` ومسارات HTML العربية/الإنجليزية المكافئة والطرق القديمة للتوافق. لا تقبل query أو hash أو `..`.

| الحقل | القاعدة |
|---|---|
| `name` | نص مطلوب بعد 2–100 حرف. |
| `company` | اختياري، حتى 160 حرفاً. |
| `phone` | مطلوب، 7–25 محرفاً من صيغة هاتف محافظة. |
| `email` | اختياري، صالح شكلياً، حتى 254 حرفاً. |
| `service` | مطلوب وأحد: `guarding`, `monitoring`, `events`, `cash`, `vip`, `training`, `platform`. |
| `city` | اختياري، حتى 100 حرف. |
| `sites` | اختياري؛ عدد صحيح من 1 إلى 1000. |
| `startDate` | اختياري؛ `YYYY-MM-DD` صحيح ومستقبلي (UTC). |
| `message` | اختياري، حتى 2000 حرف. |
| `consent` | يجب أن يساوي boolean `true`. |
| `website` | honeypot فارغ. |
| `locale` | مطلوب: `ar` أو `en`. |
| `sourcePage` | مطلوب من allowlist أعلاه. |

الصف الناتج يضيف خادمياً `requestId` و`createdAt` و`consentVersion` و`status: "new"`. لا تسجل الخدمة body أو الاسم أو الهاتف أو البريد أو IP في سجلاتها؛ أحداثها تحوي نوع الحدث و`requestId` والمسار فقط.

| النتيجة | المعنى |
|---|---|
| `201` | تم تأكيد كتابة صف واحد فقط؛ يعيد `requestId` و`status: "accepted"`. |
| `400` | JSON أو عقد أو تحقق حقول غير صالح. |
| `403` | Origin لا يطابق `APP_ORIGIN`. |
| `413` | تجاوز الجسم 8 KiB. |
| `415` | Content-Type ليس JSON. |
| `429` | تجاوز المحدد المحلي؛ ترويسة `Retry-After` إرشادية. |
| `502` | فشل append أو كانت النتيجة ملتبسة؛ لا تدّع الواجهة النجاح. |
| `503` | sink معطل أو إعداد Sheets/ADC غير جاهز؛ استخدم fallback WhatsApp الصريح فقط. |

### ملاحظة rate limiting

المحدد الحالي ذاكرة داخل **instance واحد** من Cloud Run، ولا يثق بـ `X-Forwarded-For`. لا يدعي أنه حد موزع بين النسخ أو حماية كاملة من إساءة الاستخدام. قبل فتح خدمة عامة، تقرر الجهة المالكة حماية موزعة مناسبة (مثل طبقة edge/WAF أو مخزن مركزي) مع مراجعة الخصوصية والتكلفة.

## الحاوية والبناء اليدوي لاحقاً

`Dockerfile` متعدد المراحل: ينفذ `npm ci` ثم `npm run build`، وبعدها تنسخ الصورة النهائية فقط `server/` و`assets/` وHTML ومجلدات `ar/` و`en/` و`services/` و`articles/` وملفات الحزم. لا تنسخ `src/` أو `docs/` أو `.env` أو أسرار أو PDFs خاصة. المنفذ هو `0.0.0.0:$PORT` (8080 افتراضياً). يقبل البناء `SITE_ORIGIN` لضبط canonical؛ يجب اعتماد النطاق قبل تغيير القيمة الافتراضية، وضبط `APP_ORIGIN` للتشغيل مستقل عنه.

يوجد [`cloudbuild.yaml`](../cloudbuild.yaml) للبناء **فقط**؛ ليس فيه deploy أو IAM أو `allUsers` أو إنشاء مشروع/فاتورة. لا تشغّل الأوامر التالية في هذه المهمة؛ هي قائمة يدوية للمسؤول المعتمد بعد تأكيد المشروع والمستودع والمنطقة والتكلفة:

```bash
# تحقق أولاً من المناطق المتاحة فعلياً واختر المنطقة المعتمدة.
gcloud run regions list

# بعد إنشاء Artifact Registry والهوية ومراجعة الفوترة يدوياً:
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_IMAGE_URI=REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/fursan-alamn:TAG,_SITE_ORIGIN=https://APPROVED_DOMAIN

# نشر مقيّد افتراضياً؛ لا يفتح invoker للعامة.
gcloud run deploy SERVICE_NAME \
  --image=REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/fursan-alamn:TAG \
  --region=REGION \
  --service-account=RUNTIME_SERVICE_ACCOUNT \
  --no-allow-unauthenticated \
  --set-env-vars=LEAD_SINK=sheets,APP_ORIGIN=https://APP_ORIGIN,FURSAN_SPREADSHEET_ID=APPROVED_ID,FURSAN_LEADS_SHEET=Website_Leads
```

يعني `--no-allow-unauthenticated` أن المتصفح العام لن يستطيع استخدام Cloud Run مباشرة؛ قرار فتح API أو وضعه خلف نطاق/بوابة معتمدة يحتاج مراجعة منفصلة وموافقة صريحة، ولا يعد هذا المستند نشراً عاماً. لا تنفذ الأوامر أعلاه تلقائياً.

## أقل صلاحية وهوية Google

1. أنشئ أو عيّن هوية خدمة وقت تشغيل بعد موافقة المالك، ولا تنشئ مفاتيح JSON طويلة العمر.
2. امنحها فقط ما يلزم لتشغيل Cloud Run وطلب رمز ADC وفق سياسة المشروع، ثم شارك **ملف Sheets المحدد فقط** مع بريد هوية الخدمة بصفة مناسبة للكتابة؛ لا تشارك مجلداً كاملاً أو Drive بأكمله.
3. لأن OAuth scope `spreadsheets` واسع من ناحية API، يكون تقييد الملف الحقيقي عبر ACL الخاص بالملف ومراجعة الهوية. **صلاحية Editor على الملف ليست صلاحية append-only على تبويب واحد**؛ فصل التبويب وحده لا يعزل قاعدة الشركة عن حساب الخدمة. لذلك يوصى بملف استقبال مستقل ومزامن خاص. لا تفعّل أي مشاركة هنا قبل اعتماد مالك الملف.
4. راجع أن ملف الاستقبال والمخطط أعلاه لا يخلطان طلبات الويب ببيانات تشغيلية أو شخصية أخرى، وحدد من يقرأها ومدة الاحتفاظ ومسار المزامنة والمصالحة مع الملف الرئيسي.
5. خزّن القيم الحساسة كإعدادات تشغيل أو Secret Manager وفق سياسة المشروع. Secret Manager اختياري هنا ولا يفترض أن لدينا credentials أو إذناً لإنشائه الآن.

## الأمان والامتثال

الخادم لا يقدّم إلا HTML و`robots.txt` و`sitemap.xml` و`assets/` من static root؛ يمنع `src/` و`server/` و`docs/` و`.git` والمسارات المتسللة والـ symlink خارج الجذر. يرسل CSP محلياً (مع hashes محسوبة للـ inline scripts، ومنها JSON-LD)، و`nosniff` ورفض الإطار وتقييد الصلاحيات. الأصول/fonts/scripts يجب أن تكون محلية؛ لا يعتمد التصميم الافتراضي على JavaScript خارجي أو Google seal endpoint.

**تسجيل حماية البيانات أو أي شهادة/توثيق لا يثبت بمفرده امتثالاً كاملاً.** يلزم تقييم قانوني وتشغيلي مستقل للخصوصية والأمن، ونص الموافقة، ومعالجة البيانات، والإقامة الجغرافية، والاستجابة للحوادث قبل التشغيل الفعلي.
