const DEFAULT_SOURCE_PAGES = Object.freeze([
  '/',
  '/ar',
  '/en',
  '/quote',
  '/ar/quote',
  '/en/quote',
  '/ar/contact',
  '/en/contact',
  '/quote.html',
  '/ar/quote.html',
  '/en/quote.html',
  '/contact.html',
  '/ar/contact.html',
  '/en/contact.html',
  '/index.html',
  '/ar/',
  '/en/',
]);

const DEFAULT_CONSENT_VERSION = '2026-10-privacy-v1';
const REQUIRED_LEADS_SHEET = 'Website_Leads';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function positiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function normalizeOrigin(value) {
  const raw = nonEmpty(value);
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/**
 * تُقرأ كل الأسرار والهوية من بيئة وقت التشغيل فقط. لا تُمرر إلى المتصفح.
 */
export function loadConfig(env = process.env) {
  const requestedSink = (nonEmpty(env.LEAD_SINK) || 'disabled').toLowerCase();
  const appOrigin = normalizeOrigin(env.APP_ORIGIN);
  const spreadsheetId = nonEmpty(env.FURSAN_SPREADSHEET_ID);
  const leadsSheet = nonEmpty(env.FURSAN_LEADS_SHEET);
  const configurationErrors = [];

  if (!['disabled', 'sheets'].includes(requestedSink)) {
    configurationErrors.push('LEAD_SINK must be disabled or sheets');
  }

  if (requestedSink === 'sheets') {
    if (!appOrigin) configurationErrors.push('APP_ORIGIN must be an http(s) origin without a path');
    if (!spreadsheetId) configurationErrors.push('FURSAN_SPREADSHEET_ID is required for sheets mode');
    if (!leadsSheet) configurationErrors.push('FURSAN_LEADS_SHEET is required for sheets mode');
    if (leadsSheet && leadsSheet !== REQUIRED_LEADS_SHEET) {
      configurationErrors.push(`FURSAN_LEADS_SHEET must be ${REQUIRED_LEADS_SHEET}`);
    }
  }

  const leadSubmissionEnabled = requestedSink === 'sheets' && configurationErrors.length === 0;

  return Object.freeze({
    port: positiveInteger(env.PORT, 8080, { max: 65535 }),
    requestedSink,
    mode: leadSubmissionEnabled ? 'sheets' : 'disabled',
    leadSubmissionEnabled,
    appOrigin,
    spreadsheetId,
    leadsSheet,
    consentVersion: nonEmpty(env.FURSAN_CONSENT_VERSION) || DEFAULT_CONSENT_VERSION,
    rateLimit: Object.freeze({
      limit: positiveInteger(env.LEAD_RATE_LIMIT, 8, { max: 1000 }),
      windowMs: positiveInteger(env.LEAD_RATE_WINDOW_MS, 60_000, { min: 1000, max: 3_600_000 }),
    }),
    allowedSourcePages: DEFAULT_SOURCE_PAGES,
    configurationErrors: Object.freeze(configurationErrors),
  });
}

export const LEAD_SHEET_NAME = REQUIRED_LEADS_SHEET;
export const LEAD_SHEET_HEADERS = Object.freeze([
  'requestId',
  'createdAt',
  'name',
  'company',
  'phone',
  'email',
  'service',
  'city',
  'sites',
  'startDate',
  'message',
  'locale',
  'sourcePage',
  'consentVersion',
  'status',
]);
