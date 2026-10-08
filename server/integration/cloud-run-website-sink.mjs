const CLOUD_RUN_SUFFIX = '.run.app';
export const CLOUD_RUN_LEADS_PATH = '/internal/leads';
export const MAX_CLOUD_RUN_RESPONSE_BYTES = 4 * 1024;

/** خطأ متعمدٌ عام؛ لا يحمل URL أو header أو نص استجابة أو token. */
export class CloudRunBridgeError extends Error {
  constructor(code = 'append_unconfirmed') {
    super(code);
    this.code = code;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * أصل Cloud Run فقط، بلا مسار أو بيانات مستخدم أو query/fragment أو منفذ غير 443.
 * القيمة المعادة هي الأصل القانوني الذي يستخدم كذلك كـ audience.
 */
export function canonicalCloudRunOrigin(value) {
  const raw = nonEmptyString(value);
  if (!raw) throw new TypeError('invalid_cloud_run_origin');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError('invalid_cloud_run_origin');
  }

  const hostname = url.hostname.toLowerCase();
  const isCloudRunHost = hostname.endsWith(CLOUD_RUN_SUFFIX) && hostname !== 'run.app';
  if (
    url.protocol !== 'https:'
    || !isCloudRunHost
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || (url.port && url.port !== '443')
  ) {
    throw new TypeError('invalid_cloud_run_origin');
  }

  return url.origin;
}

function configuredOrigins(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('cloud_run_origin_allowlist_required');
  }
  return new Set(value.map((origin) => canonicalCloudRunOrigin(origin)));
}

async function waitForAbortable(value, signal) {
  if (signal?.aborted) throw new CloudRunBridgeError();
  if (!signal) return value;

  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new CloudRunBridgeError());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve(value), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function cancelQuietly(value) {
  try {
    const cancelled = value?.cancel?.();
    if (cancelled && typeof cancelled.catch === 'function') cancelled.catch(() => {});
  } catch {
    // إلغاء stream بعد المهلة أفضل جهد فقط ولا يغير الخطأ العام.
  }
}

async function readLimitedJson(response, maxBytes, signal) {
  const contentLength = Number.parseInt(response.headers?.get?.('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new CloudRunBridgeError();
  }
  if (!response.body) throw new CloudRunBridgeError();

  const chunks = [];
  let size = 0;
  try {
    const reader = typeof response.body.getReader === 'function' ? response.body.getReader() : null;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await waitForAbortable(reader.read(), signal);
          if (done) break;
          const bytes = Buffer.from(value);
          size += bytes.length;
          if (size > maxBytes) {
            // لا نحتفظ برد كبير، ولا نحاول الطلب مرة ثانية.
            throw new CloudRunBridgeError();
          }
          chunks.push(bytes);
        }
      } finally {
        if (signal?.aborted) cancelQuietly(reader);
        reader.releaseLock();
      }
    } else {
      const iterator = response.body[Symbol.asyncIterator]?.();
      if (!iterator) throw new CloudRunBridgeError();
      try {
        for (;;) {
          const { done, value } = await waitForAbortable(iterator.next(), signal);
          if (done) break;
          const bytes = Buffer.from(value);
          size += bytes.length;
          if (size > maxBytes) throw new CloudRunBridgeError();
          chunks.push(bytes);
        }
      } finally {
        if (signal?.aborted) cancelQuietly(iterator);
      }
    }
  } catch (error) {
    if (error instanceof CloudRunBridgeError) throw error;
    throw new CloudRunBridgeError();
  }

  try {
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } catch {
    throw new CloudRunBridgeError();
  }
}

/**
 * يصدر ID token من Application Default Credentials فقط. لا يقبل ولا يقرأ مفاتيح JSON.
 * يحفظ العميل per-audience من دون أن يخزن token في ملفات أو logs.
 */
export async function createAdcIdTokenProvider({ auth } = {}) {
  let resolvedAuth = auth;
  if (!resolvedAuth) {
    const { GoogleAuth } = await import('google-auth-library');
    resolvedAuth = new GoogleAuth();
  }
  if (typeof resolvedAuth.getIdTokenClient !== 'function') {
    throw new TypeError('invalid_google_auth');
  }

  const clients = new Map();
  return async function getIdToken(audience) {
    const canonicalAudience = canonicalCloudRunOrigin(audience);
    try {
      let client = clients.get(canonicalAudience);
      if (!client) {
        client = await resolvedAuth.getIdTokenClient(canonicalAudience);
        clients.set(canonicalAudience, client);
      }
      const token = await client?.idTokenProvider?.fetchIdToken(canonicalAudience);
      if (typeof token !== 'string' || !token) throw new Error('missing_token');
      return token;
    } catch {
      throw new CloudRunBridgeError('id_token_unavailable');
    }
  };
}

/**
 * Sink واحد الاتجاه إلى endpoint ثابت. لا يقبل URL من lead ولا يعيد المحاولة عند
 * أي فشل، لأن حالة append الشبكية قد تكون ملتبسة.
 */
export function createCloudRunWebsiteSink({
  origin,
  audience = origin,
  allowedOrigins,
  getIdToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5_000,
  maxResponseBytes = MAX_CLOUD_RUN_RESPONSE_BYTES,
} = {}) {
  const canonicalOrigin = canonicalCloudRunOrigin(origin);
  const canonicalAudience = canonicalCloudRunOrigin(audience);
  const allowlist = configuredOrigins(allowedOrigins);

  if (canonicalAudience !== canonicalOrigin || !allowlist.has(canonicalOrigin)) {
    throw new TypeError('cloud_run_origin_not_allowed');
  }
  if (typeof getIdToken !== 'function' || typeof fetchImpl !== 'function') {
    throw new TypeError('invalid_cloud_run_sink');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new TypeError('invalid_cloud_run_timeout');
  }
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > MAX_CLOUD_RUN_RESPONSE_BYTES) {
    throw new TypeError('invalid_cloud_run_response_limit');
  }

  const endpoint = `${canonicalOrigin}${CLOUD_RUN_LEADS_PATH}`;
  return Object.freeze({
    origin: canonicalOrigin,
    audience: canonicalAudience,
    endpoint,
    async append(lead) {
      const requestId = lead?.requestId;
      if (typeof requestId !== 'string' || !requestId) throw new CloudRunBridgeError();

      let idToken;
      try {
        idToken = await getIdToken(canonicalAudience);
      } catch {
        throw new CloudRunBridgeError('id_token_unavailable');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await waitForAbortable(fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            // Cloud Run IAM يتحقق من هذا عند وجود الترويسَتين ويزيل توقيعه قبل الحاوية.
            'x-serverless-authorization': `Bearer ${idToken}`,
            // يبقى كاملاً كي يتحقق receiver منه cryptographically داخل التطبيق.
            authorization: `Bearer ${idToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(lead),
        }), controller.signal);

        if (response.status !== 201) throw new CloudRunBridgeError();
        // تبقى المهلة فعالة حتى يكتمل stream الرد المحدود، لا حتى وصول headers فقط.
        const confirmation = await readLimitedJson(response, maxResponseBytes, controller.signal);
        if (confirmation?.updatedRows !== 1 || confirmation?.requestId !== requestId) {
          throw new CloudRunBridgeError();
        }
        return Object.freeze({ updatedRows: 1, requestId });
      } catch {
        throw new CloudRunBridgeError();
      } finally {
        clearTimeout(timeout);
        // يحرر أي قراءة معلقة أو stream بطيء حتى بعد نجاح confirmation.
        controller.abort();
      }
    },
  });
}
