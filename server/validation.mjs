const SERVICE_VALUES = new Set(['guarding', 'monitoring', 'events', 'cash', 'vip', 'training', 'platform']);
const LOCALE_VALUES = new Set(['ar', 'en']);
const EXPECTED_FIELDS = new Set([
  'name',
  'company',
  'phone',
  'email',
  'service',
  'city',
  'sites',
  'startDate',
  'message',
  'consent',
  'website',
  'locale',
  'sourcePage',
]);

export const MAX_LEAD_BODY_BYTES = 8 * 1024;

export class RequestError extends Error {
  constructor(statusCode, code) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isOptionalBlank(value) {
  return value === undefined || value === null || value === '';
}

function optionalText(value, maximum, field, errors) {
  if (isOptionalBlank(value)) return '';
  if (typeof value !== 'string') {
    errors.push(field);
    return '';
  }
  const normalized = value.trim();
  if (normalized.length > maximum) errors.push(field);
  return normalized;
}

function requiredText(value, minimum, maximum, field, errors) {
  if (typeof value !== 'string') {
    errors.push(field);
    return '';
  }
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) errors.push(field);
  return normalized;
}

function validEmail(value) {
  // فحص عملي محافظ، لا يستبدل فحص صلاحية صندوق البريد.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function validPhone(value) {
  return /^[+]?[0-9][0-9 ()-]{6,24}$/.test(value);
}

function validFutureIsoDate(value, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  return value > now.toISOString().slice(0, 10);
}

function validSourcePage(value, allowedSourcePages) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\') || value.includes('?') || value.includes('#') || value.includes('\u0000')) return false;
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) return false;
  return allowedSourcePages.includes(value);
}

/**
 * يعيد حقولاً معتمدة فقط؛ لا تمرر الحقول غير المتوقعة إلى جهة التخزين.
 */
export function validateLeadPayload(payload, { now = new Date(), allowedSourcePages = [] } = {}) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['body'] };
  }

  for (const key of Object.keys(payload)) {
    if (!EXPECTED_FIELDS.has(key)) errors.push('unexpected_field');
  }

  const name = requiredText(payload.name, 2, 100, 'name', errors);
  const company = optionalText(payload.company, 160, 'company', errors);
  const phone = requiredText(payload.phone, 7, 25, 'phone', errors);
  if (phone && !validPhone(phone)) errors.push('phone');

  const email = optionalText(payload.email, 254, 'email', errors);
  if (email && !validEmail(email)) errors.push('email');

  const service = requiredText(payload.service, 1, 30, 'service', errors);
  if (service && !SERVICE_VALUES.has(service)) errors.push('service');

  const city = optionalText(payload.city, 100, 'city', errors);
  const message = optionalText(payload.message, 2000, 'message', errors);

  let sites = '';
  if (!isOptionalBlank(payload.sites)) {
    const candidate = typeof payload.sites === 'number'
      ? payload.sites
      : (typeof payload.sites === 'string' && /^\d+$/.test(payload.sites.trim())
        ? Number(payload.sites.trim())
        : Number.NaN);
    if (!Number.isInteger(candidate) || candidate < 1 || candidate > 1000) {
      errors.push('sites');
    } else {
      sites = String(candidate);
    }
  }

  const startDate = optionalText(payload.startDate, 10, 'startDate', errors);
  if (startDate && !validFutureIsoDate(startDate, now)) errors.push('startDate');

  if (payload.consent !== true) errors.push('consent');

  const website = optionalText(payload.website, 200, 'website', errors);
  if (website) errors.push('website'); // حقل honeypot: يجب أن يبقى فارغاً.

  const locale = requiredText(payload.locale, 2, 2, 'locale', errors);
  if (locale && !LOCALE_VALUES.has(locale)) errors.push('locale');

  const sourcePage = typeof payload.sourcePage === 'string' ? payload.sourcePage : '';
  if (!validSourcePage(sourcePage, allowedSourcePages)) errors.push('sourcePage');

  if (errors.length > 0) {
    return { valid: false, errors: [...new Set(errors)] };
  }

  return {
    valid: true,
    value: Object.freeze({
      name,
      company,
      phone,
      email,
      service,
      city,
      sites,
      startDate,
      message,
      locale,
      sourcePage,
    }),
  };
}

export function contentTypeIsJson(value) {
  return typeof value === 'string' && value.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

/** يقرأ البايتات مرة واحدة ولا يكدس جسماً أكبر من الحد في الذاكرة. */
export function readJsonBody(request, maxBytes = MAX_LEAD_BODY_BYTES) {
  const contentLength = Number.parseInt(request.headers['content-length'], 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    request.resume();
    return Promise.reject(new RequestError(413, 'payload_too_large'));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    request.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        // نستنزف ما تبقى من الطلب بدلاً من الاحتفاظ به أو إعادة محاولة الإرسال.
        request.resume();
        fail(new RequestError(413, 'payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', () => fail(new RequestError(400, 'invalid_request')));
    request.on('end', () => {
      if (settled) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        fail(new RequestError(400, 'invalid_json'));
      }
    });
  });
}

/**
 * محدد معدل لكل instance فقط. لا يقرأ X-Forwarded-For ولا يدعي حماية موزعة.
 */
export function createMemoryRateLimiter({ limit = 8, windowMs = 60_000 } = {}) {
  const buckets = new Map();

  return {
    take(key, now = Date.now()) {
      const threshold = now - windowMs;
      const current = (buckets.get(key) || []).filter((timestamp) => timestamp > threshold);
      if (current.length >= limit) {
        buckets.set(key, current);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current[0] + windowMs - now) / 1000)) };
      }
      current.push(now);
      buckets.set(key, current);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
