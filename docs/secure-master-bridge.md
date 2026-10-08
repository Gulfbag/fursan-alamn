# الجسر المرحلي المؤمّن إلى Master: Cloud Run service-to-service

> **الحالة الحالية: غير مفعّل افتراضياً، ولا توجد مزامنة إلى Fursan-Master-Database.**
>
> أُضيفت آلية قابلة للاختبار لعزل Leads في staging. لا ينشئ هذا المستودع مشروع GCP أو خدمة Cloud Run أو حساب خدمة أو قاعدة بيانات، ولا ينشر أي شيء. يلزم تأكيد مالك المشروع قبل أي إعداد IAM أو نشر فعلي.

## الحدود الأمنية

يوجد طرفان منفصلان، ولا يُستبدل أي منهما بـ Master:

1. **Website sink** في `server/integration/cloud-run-website-sink.mjs`: يرسل envelope الذي أنشأه خادم الموقع إلى مسار ثابت فقط: `POST /internal/leads`.
2. **Receiver المرحلي** في `server/integration/cloud-run-receiver.mjs`: خدمة Cloud Run مستقلة تستقبل الطلب، تتحقق منه، ثم تستدعي `sink.append()` محقوناً. يمكن حقن `createSheetsSink` هنا لاحقاً نحو **ملف استقبال مرحلي منفصل** فقط.

لا توجد قراءة أو كتابة أو تزامن أو client لـ **Fursan-Master-Database**. لا يوجد تخزين ذاكرة يدّعي الديمومة، ولا Firestore أو Cloud SQL قبل اعتماد schema وملكية البيانات وخطة retention صريحة.

## ضمانات Website sink

`createCloudRunWebsiteSink()` يقبل `origin` من إعداد المشغّل فقط؛ لا ينظر إطلاقاً إلى URL في lead أو header أو body. ولتشغيله يلزم:

- `origin` و`audience` قانونيان كـ `https://*.run.app`، ولا يحتويان userinfo أو مساراً (إلا `/`) أو query أو fragment أو منفذاً غير `443`.
- `audience` القانوني **مساوٍ** لـ `origin` القانوني.
- `allowedOrigins` قائمة تشغيل دقيقة non-empty، ويجب أن تضم origin نفسه؛ رفض origin صالح شكلياً لكنه غير موجود فيها يمنع SSRF أو خطأ البيئة.
- endpoint الناتج ثابت: `${origin}/internal/leads`.
- ID token مصدره ADC عبر `GoogleAuth.getIdTokenClient(audience)` ثم `client.idTokenProvider.fetchIdToken(audience)`. لا توجد مفاتيح JSON أو credentials متصفح أو token محفوظ.
- يرسل الطلب **الترويسَتين نفسيهما**: `X-Serverless-Authorization: Bearer <id-token>` لحاجز Cloud Run IAM و`Authorization: Bearer <id-token>` للتحقق داخل التطبيق. وفق [توثيق Google](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)، عند وجودهما يتحقق Cloud Run من `X-Serverless-Authorization` فقط ويزيل توقيعه قبل الحاوية؛ لذلك يبقى `Authorization` كاملاً لـ `verifyIdToken` في receiver.
- `fetch` يستخدم `redirect: 'error'` و`AbortController` بمهلة واحدة تبقى فعالة من الطلب حتى انتهاء قراءة stream الرد المحدود. لا يقرأ أكثر من **4 KiB**، ويلغي controller/stream عند النهاية أو المهلة. لا توجد retries لأن append قد يكون نجح في الشبكة رغم فشل العميل.
- النجاح وحده هو HTTP `201` مع `{ "updatedRows": 1, "requestId": "نفس-المعرّف" }`.
- الأخطاء عامة (`append_unconfirmed` أو `id_token_unavailable`) ولا تحمل URL أو authorization header أو token أو نص رد.

## عقد envelope الثابت

الـ receiver يقبل JSON حتى **8 KiB** فقط وبالمفاتيح الخمسة عشر التالية، بلا مفاتيح إضافية أو ناقصة:

| الحقل | الشرط |
|---|---|
| `requestId` | UUID v4 أنشأه خادم Website |
| `createdAt` | ISO 8601 canonical بصيغة `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `name` إلى `sourcePage` | حقول lead المعتمدة نفسها في `server/validation.mjs` (11 حقلاً) |
| `consentVersion` | قيمة exact من `consentVersion` المشغّل، أو من allowlist صريح |
| `status` | `new` فقط |

لا يُنقل `consent` ولا `website` عبر الجسر. ينشئ Website envelope **بعد** التحقق من موافقة المستخدم؛ ويعيد receiver بناء `{ consent: true, website: '' }` داخلياً فقط ليستدعي `validateLeadPayload` الحالية. هذا ليس دليلاً جديداً للموافقة، ولا يجوز اعتباره أو تخزينه كإثبات مستقل. لا يعيد `validateLeadEnvelopeExact` body الخام أو مجموعة بيانات العميل؛ يعيد حقولاً validated ومحددة فقط.

## عقد receiver والمصادقة

`createCloudRunReceiver({ config, sink, tokenVerifier, logger })` لديه فقط:

- `GET /healthz` → `200` بلا تفاصيل اعتماد.
- `POST /internal/leads` → endpoint الوحيد للإدخال.

أي method آخر على المسار يعيد `405`، وأي مسار آخر `404`. لا يضيف receiver `Access-Control-Allow-Origin` ولا يستعمل `Origin` في التفويض: **CORS/browser origin ليس مصادقة** ولا ينطبق على Cloud Run service-to-service.

عند `config.enabled !== true`، أو عدم وجود sink حقيقي، يعيد `503 bridge_unavailable` قبل الكتابة. النجاح `201` لا يحدث إلا بعد أن يعيد `sink.append(validatedLead)` `{ updatedRows: 1 }`.

يُمرر `tokenVerifier` بالحقن للاختبارات. في التشغيل، `createGoogleIdTokenVerifier()` يستخدم `google-auth-library` و`OAuth2Client.verifyIdToken({ idToken, audience })` للتحقق cryptographically. بعد ذلك يفرض receiver بنفسه:

- `Authorization: Bearer <id-token>` إلزامي؛ غيابه `401`.
- `iss` أحد issuerَي Google الموثوقين: `https://accounts.google.com` أو `accounts.google.com`.
- `aud` يساوي origin/audience المشغّل بالضبط.
- `email_verified === true` كقيمة Boolean حقيقية.
- `email` موجود في `allowedServiceAccountEmails` الدقيقة غير الفارغة.

لا يقرأ أو يثق في `X-Goog-Authenticated-User-Email` أو أي email header آخر؛ header قابل للتزوير إن تغيّر مسار الشبكة. Cloud Run IAM هو **خط الدفاع الأساسي**، وJWT verifier هذه طبقة دفاع إضافية داخل الخدمة.

## مرجع عقد التشغيل

كل المتغيرات التالية **خادمية فقط**؛ لا يخرج `GET /api/public-config` عن `mode` و`leadSubmissionEnabled`، ولا توجد قيمة bridge أو ID أو token في HTML أو JavaScript العميل.

### Website: `server/config.mjs` و`server/index.mjs`

| المتغير | العقد |
|---|---|
| `APP_ENV` | `production` افتراضي أو `staging` فقط. |
| `LEAD_SINK` | `disabled` افتراضي؛ أو `sheets` في production فقط؛ أو `bridge`. |
| `APP_ORIGIN` | origin HTTP(S) كامل بلا path/query، إلزامي في `sheets` و`bridge`. |
| `BRIDGE_ORIGIN` | origin Cloud Run قانوني `https://*.run.app` بلا مسار، إلزامي في `bridge`. |
| `BRIDGE_AUDIENCE` | origin Cloud Run قانوني ومطابق قانونياً لـ `BRIDGE_ORIGIN` بالضبط. |
| `BRIDGE_ALLOWED_ORIGINS` | CSV non-empty من origins Cloud Run القانونية، وتضم `BRIDGE_ORIGIN`. |

يفشل الإعداد مغلقاً إلى `mode: disabled` و`POST /api/leads → 503` عند نقص أي شرط. في `APP_ENV=staging` لا يمكن استخدام `LEAD_SINK=sheets` مباشرة: المسار المسموح عند التمكين هو `bridge` فقط. ينشئ `index.mjs` `createCloudRunWebsiteSink` مع ADC بعد نجاح العقد فقط، ولا يقبل endpoint من العميل.

### Receiver: `server/integration/receiver-index.mjs`

هذا entrypoint مستقل (`node server/integration/receiver-index.mjs`) ويستعمل الصورة نفسها؛ لا توجد صورة ثانية ولا معرّف مشروع/خدمة حقيقي في المصدر. تصدّر `loadReceiverRuntimeContract(env)` كدالة نقية للاختبار ولا يبدأ server أو ADC لمجرد `import`.

| المتغير | العقد |
|---|---|
| `BRIDGE_RECEIVER_ENABLED` | `false` افتراضياً. عنده لا ينشأ ADC أو Sheets sink ويعيد endpoint `503`. |
| `APP_ENV` عند التمكين | يجب أن يكون `staging` بالضبط بعد normalization. |
| `BRIDGE_AUDIENCE` | origin Cloud Run قانوني. |
| `BRIDGE_ALLOWED_CALLERS` | CSV non-empty فريد من رسائل service account القانونية `…@….iam.gserviceaccount.com`. |
| `FURSAN_STAGING_SPREADSHEET_ID` | مطلوب عند التمكين فقط، ويُمرر إلى `createSheetsSink` المرحلي فقط. |
| `FURSAN_STAGING_LEADS_SHEET` | يجب أن يساوي `Website_Leads`. |
| `FURSAN_MASTER_SYNC` | فارغ أو `disabled` فقط؛ أي قيمة غير ذلك توقف startup بحدث عام. |

يستخدم receiver `FURSAN_CONSENT_VERSION` الحالي و`allowedSourcePages` من config المشترك فقط. لا يقرأ أو يكتب أو يزامن أي Master، ولا يقرأ أي متغير Master spreadsheet. الإعداد الناقص عند تمكينه يوقف startup مع `{ "event": "bridge_receiver_startup_failed" }` بلا IDs أو secrets؛ أما receiver المعطّل فـ `GET /healthz` يعطي `{ "status": "ok" }` كحيوية HTTP فقط، **وليس** ادعاء اتصال DB أو Sheets.

## قواعد حماية staging وCloud Run/IAM

هذه الخطوات **إرشادية فقط ولم تُنفذ**:

1. يحدد مالك المشروع خدمة receiver وservice account الذي يعمل به Website caller في staging.
2. يطلب المالك grant محدوداً على خدمة receiver بعينها فقط: `roles/run.invoker` للـ caller service account. مثال مراجعة فقط:

   ```bash
   gcloud run services add-iam-policy-binding RECEIVER_SERVICE \
     --region=REGION --project=PROJECT_ID \
     --member=serviceAccount:WEBSITE_CALLER@PROJECT_ID.iam.gserviceaccount.com \
     --role=roles/run.invoker
   ```

3. لا تضف `allUsers` أو `allAuthenticatedUsers`، ولا تستخدم `--allow-unauthenticated`. يلزم إبقاء receiver **غير عام**. خصوصية المرحلة الحالية هي IAM + HTTPS المصادق عليه؛ لا تفعّل `networkIngressInternal` أو VPN/VPC جديدة كبديل أو شرط غير معتمد.
4. موقع staging محمي بـ IAP وهوية Website service account، وreceiver الخاص محمي بـ Cloud Run IAM وهوية bridge service account. IAP ليس بديلاً عن token Cloud Run أو `verifyIdToken` داخل receiver. لا يوجد مسار Browser أو header هوية عادي كبديل للتفويض.
5. `APP_ENV=staging` يضيف `X-Robots-Tag: noindex, nofollow, noarchive` لكل رد HTTP ويستبدل `GET /robots.txt` بـ `User-agent: *` / `Disallow: /`. لا ينطبق هذا على production.
6. انشر Website caller بهوية service account عبر ADC/Cloud Run، لا ملف مفتاح. لا تمنح service account صلاحية `TokenCreator` لنفسه من دون اعتماد؛ إذا احتاجت impersonation لاحقاً فهي قرار منفصل معتمد.
7. شغّل integration tests ثم cloud test يدوي يثبت Website المحمي وreceiver المعطّل، بموافقة المالك.

## وجهة الاستقبال المرحلية

عند تفعيل Sheets مستقبلاً، أنشئ spreadsheet منفصلاً عن Master وأعط خدمة staging حق الوصول للملف المنفصل فقط. دور **Editor على ملف Sheets ليس append-only**؛ يمكنه تعديل/حذف محتوى الملف، لذلك لا يمثل append-only boundary ولا يصلح كبديل لعقد Master. لا توجد حالياً Sheet ACL، ولا `201` صادر من RAM/receiver، ولا تمنح الحساب أي ACL على ملف Master.

قبل أي تفعيل لـ `BRIDGE_RECEIVER_ENABLED=true`، تحقّق فعلياً في بيئة Cloud Run من أن ADC عبر metadata/token بصلاحية `cloud-platform` يستطيع طلب Google Sheets scope المطلوب. لا تضف ملف JSON key، ولا تفترض أن scope Sheets يعمل من دون هذا التحقق. لا يعني وجود PG16 Cloud SQL أو وصلة Sheets غير متحققة أن أي Master backend أو schema أو sync صار جزءاً من هذا الجسر.

## ما تثبته الاختبارات

`tests/integration-secure-master-bridge.test.mjs` يثبت محلياً بلا GCP calls: منع SSRF/origin وaudience، عقد production/staging وdisabled، رفض caller/issuer/audience غير الصحيح، الترويسَتين IAM/application، endpoint/method وCORS غير المصادق، stream الرد البطيء أو غير المنتهي وحد 4KiB، وتعطيل receiver وعقده النقي. كما يثبت أن receiver يستدعي `append` المحقون فقط ولا ينفذ أي مسار Master. وتثبت `tests/server.test.mjs` حماية robots في staging وعدم انعكاسها على production.

```bash
node --test tests/integration-secure-master-bridge.test.mjs
```
