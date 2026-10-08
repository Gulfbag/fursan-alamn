import {
  MAX_LEAD_BODY_BYTES,
  RequestError,
  contentTypeIsJson,
  readJsonBody,
  validateLeadPayload,
} from '../validation.mjs';
import { LEAD_SHEET_HEADERS } from '../config.mjs';
import { canonicalCloudRunOrigin } from './cloud-run-website-sink.mjs';

export const CLOUD_RUN_RECEIVER_PATH = '/internal/leads';
export const GOOGLE_OIDC_ISSUERS = Object.freeze([
  'https://accounts.google.com',
  'accounts.google.com',
]);

// عقد الجسر يتبع الأعمدة الخمسة عشر المعتمدة في config، لا body متغيراً من العميل.
const ENVELOPE_FIELDS = Object.freeze([...LEAD_SHEET_HEADERS]);
const ENVELOPE_FIELD_SET = new Set(ENVELOPE_FIELDS);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_ACCOUNT_EMAIL = /^[a-z][a-z0-9-]{0,62}@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/;

function sendJson(response, statusCode, payload, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

function sendNotFound(response) {
  response.statusCode = 404;
  response.setHeader('content-type', 'text/plain; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end('Not Found');
}

function validCreatedAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function uniqueStrings(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.map((item) => typeof item === 'string' ? item.trim() : '');
  if (values.some((item) => !item)) return null;
  return new Set(values);
}

function receiverConfiguration(config = {}) {
  if (config.enabled !== true) return Object.freeze({ enabled: false });

  const audience = canonicalCloudRunOrigin(config.audience);
  const allowedServiceAccountEmails = uniqueStrings(config.allowedServiceAccountEmails);
  const allowedSourcePages = uniqueStrings(config.allowedSourcePages);
  const configuredConsentVersions = Object.hasOwn(config, 'allowedConsentVersions')
    ? uniqueStrings(config.allowedConsentVersions)
    : uniqueStrings([config.consentVersion]);

  if (
    !allowedServiceAccountEmails
    || !allowedSourcePages
    || !configuredConsentVersions
    || [...allowedServiceAccountEmails].some((email) => !SERVICE_ACCOUNT_EMAIL.test(email))
  ) {
    throw new TypeError('invalid_cloud_run_receiver_configuration');
  }

  return Object.freeze({
    enabled: true,
    audience,
    allowedServiceAccountEmails,
    allowedSourcePages: Object.freeze([...allowedSourcePages]),
    allowedConsentVersions: configuredConsentVersions,
  });
}

function bearerToken(value) {
  if (Array.isArray(value) || typeof value !== 'string') return '';
  const match = /^Bearer ([^\s]+)$/.exec(value);
  return match ? match[1] : '';
}

function allowedClaims(claims, config) {
  return Boolean(
    claims
    && typeof claims === 'object'
    && GOOGLE_OIDC_ISSUERS.includes(claims.iss)
    && claims.aud === config.audience
    && typeof claims.email === 'string'
    && config.allowedServiceAccountEmails.has(claims.email)
    && claims.email_verified === true,
  );
}

function logEvent(logger, event) {
  // سجل bridge لا يحوي claims أو token أو body أو PII أو runtime identifiers.
  if (logger && typeof logger.info === 'function') logger.info({ event });
}

/**
 * يتحقق OAuth2Client من توقيع Google وشهادته cryptographically، ويستقبل audience
 * المحدد. التحميل كسول كي لا تحدث أي مكالمة خارجية عند بناء التطبيق أو الاختبار.
 */
export function createGoogleIdTokenVerifier({ oauth2Client } = {}) {
  let clientPromise = oauth2Client ? Promise.resolve(oauth2Client) : null;
  return Object.freeze({
    async verify({ idToken, audience }) {
      try {
        if (!clientPromise) {
          clientPromise = import('google-auth-library').then(({ OAuth2Client }) => new OAuth2Client());
        }
        const client = await clientPromise;
        if (typeof client?.verifyIdToken !== 'function') throw new Error('invalid_verifier');
        const ticket = await client.verifyIdToken({ idToken, audience });
        return ticket?.getPayload?.() || null;
      } catch {
        // لا تسرب سبب التحقق أو token إلى HTTP/logs.
        return null;
      }
    },
  });
}

function verifierFor(tokenVerifier) {
  if (typeof tokenVerifier === 'function') return { verify: tokenVerifier };
  if (tokenVerifier && typeof tokenVerifier.verify === 'function') return tokenVerifier;
  throw new TypeError('invalid_token_verifier');
}

/**
 * يتحقق من envelope الثابت، ثم يعيد بناء body الأصلي لتمرير validateLeadPayload
 * الحالية مع consent:true وwebsite:'' فقط. لا يعيد أو يمرر body الخام إلى sink.
 */
export function validateLeadEnvelopeExact(envelope, {
  now = new Date(),
  allowedSourcePages = [],
  allowedConsentVersions = [],
} = {}) {
  const errors = [];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { valid: false, errors: ['body'] };
  }

  for (const key of Object.keys(envelope)) {
    if (!ENVELOPE_FIELD_SET.has(key)) errors.push('unexpected_field');
  }
  for (const field of ENVELOPE_FIELDS) {
    if (!Object.hasOwn(envelope, field)) errors.push(field);
  }
  if (!UUID_V4.test(envelope.requestId || '')) errors.push('requestId');
  if (!validCreatedAt(envelope.createdAt)) errors.push('createdAt');
  if (envelope.status !== 'new') errors.push('status');
  if (typeof envelope.consentVersion !== 'string' || !allowedConsentVersions.includes(envelope.consentVersion)) {
    errors.push('consentVersion');
  }

  const leadResult = validateLeadPayload({
    name: envelope.name,
    company: envelope.company,
    phone: envelope.phone,
    email: envelope.email,
    service: envelope.service,
    city: envelope.city,
    sites: envelope.sites,
    startDate: envelope.startDate,
    message: envelope.message,
    locale: envelope.locale,
    sourcePage: envelope.sourcePage,
    // الـ receiver لا يقبل consent من الشبكة؛ الـ website أضاف envelope بعد تحقق موافقته.
    consent: true,
    website: '',
  }, { now, allowedSourcePages });
  if (!leadResult.valid) errors.push(...leadResult.errors);

  if (errors.length > 0) return { valid: false, errors: [...new Set(errors)] };
  return {
    valid: true,
    value: Object.freeze({
      requestId: envelope.requestId,
      createdAt: envelope.createdAt,
      ...leadResult.value,
      consentVersion: envelope.consentVersion,
      status: 'new',
    }),
  };
}

/**
 * Cloud Run IAM هو الحاجز الأول. مع الترويسَتين يتحقق IAM من
 * X-Serverless-Authorization، بينما يبقى Authorization كاملاً للتحقق هنا. لا يقرأ
 * هذا التطبيق أي header هوية تضيفه المنصة ولا يفك JWT من دون verifyIdToken.
 */
export function createCloudRunReceiver({
  config = {},
  sink,
  tokenVerifier = createGoogleIdTokenVerifier(),
  logger = console,
  now = () => new Date(),
} = {}) {
  const receiverConfig = receiverConfiguration(config);
  const verifier = verifierFor(tokenVerifier);

  return async function cloudRunReceiver(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(response, 200, { status: 'ok' });
    }
    if (url.pathname !== CLOUD_RUN_RECEIVER_PATH) return sendNotFound(response);
    if (request.method !== 'POST') {
      request.resume();
      return sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'POST' });
    }
    if (!receiverConfig.enabled || !sink || typeof sink.append !== 'function') {
      request.resume();
      return sendJson(response, 503, { error: 'bridge_unavailable' });
    }
    if (!contentTypeIsJson(request.headers['content-type'])) {
      request.resume();
      return sendJson(response, 415, { error: 'unsupported_media_type' });
    }

    const applicationIdToken = bearerToken(request.headers.authorization);
    if (!applicationIdToken) return sendJson(response, 401, { error: 'authentication_required' });

    let claims;
    try {
      claims = await verifier.verify({ idToken: applicationIdToken, audience: receiverConfig.audience });
    } catch {
      claims = null;
    }
    if (!allowedClaims(claims, receiverConfig)) {
      return sendJson(response, 403, { error: 'caller_not_allowed' });
    }

    let envelope;
    try {
      envelope = await readJsonBody(request, MAX_LEAD_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestError) return sendJson(response, error.statusCode, { error: error.code });
      return sendJson(response, 400, { error: 'invalid_request' });
    }

    const result = validateLeadEnvelopeExact(envelope, {
      now: now(),
      allowedSourcePages: receiverConfig.allowedSourcePages,
      allowedConsentVersions: [...receiverConfig.allowedConsentVersions],
    });
    if (!result.valid) return sendJson(response, 400, { error: 'invalid_request' });

    try {
      const appendResult = await sink.append(result.value);
      if (appendResult?.updatedRows !== 1) throw new Error('append_unconfirmed');
    } catch {
      logEvent(logger, 'cloud_run_receiver_append_unconfirmed');
      return sendJson(response, 502, { error: 'lead_delivery_unconfirmed', requestId: result.value.requestId });
    }

    logEvent(logger, 'cloud_run_receiver_accepted');
    return sendJson(response, 201, { requestId: result.value.requestId, updatedRows: 1 });
  };
}

export { ENVELOPE_FIELDS, MAX_LEAD_BODY_BYTES };
