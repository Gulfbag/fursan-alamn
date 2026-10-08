import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.mjs';
import { createGoogleAccessTokenProvider, createSheetsSink } from '../sheets-sink.mjs';
import { canonicalCloudRunOrigin } from './cloud-run-website-sink.mjs';
import { createCloudRunReceiver } from './cloud-run-receiver.mjs';

const REQUIRED_LEADS_SHEET = 'Website_Leads';
const SERVICE_ACCOUNT_EMAIL = /^[a-z][a-z0-9-]{0,62}@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/;

export class ReceiverRuntimeContractError extends Error {
  constructor() {
    super('invalid_receiver_runtime_contract');
    this.code = 'invalid_receiver_runtime_contract';
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function csvValues(value) {
  const raw = nonEmpty(value);
  if (!raw) return null;
  const values = raw.split(',').map((item) => item.trim());
  if (values.some((item) => !item) || new Set(values).size !== values.length) return null;
  return values;
}

function enabledValue(value) {
  const normalized = (nonEmpty(value) || 'false').toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new ReceiverRuntimeContractError();
}

function canonicalAudience(value) {
  try {
    return canonicalCloudRunOrigin(value);
  } catch {
    throw new ReceiverRuntimeContractError();
  }
}

/**
 * عقد بيئة receiver فقط. الدالة نقية ولا تنشئ server أو ADC أو أي اتصال Google، كي
 * يمكن اختبارها بأمان. لا تقرأ أي إعداد Master ولا تعرف مُعرّفه.
 */
export function loadReceiverRuntimeContract(env = process.env) {
  // نستخدم إعداد الموقع فقط لاستخراج consentVersion وallowedSourcePages المشتركة، مع
  // تعطيل website sink كي لا تجعل متغيراته غير ذات الصلة receiver صالحاً أو معطلاً.
  const sharedConfig = loadConfig({ ...env, LEAD_SINK: 'disabled' });
  if (sharedConfig.configurationErrors.length > 0) throw new ReceiverRuntimeContractError();

  const masterSync = nonEmpty(env.FURSAN_MASTER_SYNC);
  if (masterSync && masterSync !== 'disabled') throw new ReceiverRuntimeContractError();

  const enabled = enabledValue(env.BRIDGE_RECEIVER_ENABLED);
  if (!enabled) {
    return Object.freeze({
      enabled: false,
      port: sharedConfig.port,
    });
  }

  if (sharedConfig.appEnv !== 'staging') throw new ReceiverRuntimeContractError();

  const audience = canonicalAudience(env.BRIDGE_AUDIENCE);
  const allowedServiceAccountEmails = csvValues(env.BRIDGE_ALLOWED_CALLERS);
  const stagingSpreadsheetId = nonEmpty(env.FURSAN_STAGING_SPREADSHEET_ID);
  const stagingLeadsSheet = nonEmpty(env.FURSAN_STAGING_LEADS_SHEET);
  if (
    !allowedServiceAccountEmails
    || allowedServiceAccountEmails.some((email) => !SERVICE_ACCOUNT_EMAIL.test(email))
    || !stagingSpreadsheetId
    || stagingLeadsSheet !== REQUIRED_LEADS_SHEET
  ) {
    throw new ReceiverRuntimeContractError();
  }

  return Object.freeze({
    enabled: true,
    port: sharedConfig.port,
    audience,
    allowedServiceAccountEmails: Object.freeze([...allowedServiceAccountEmails]),
    allowedSourcePages: sharedConfig.allowedSourcePages,
    consentVersion: sharedConfig.consentVersion,
    stagingSpreadsheetId,
    stagingLeadsSheet,
  });
}

/**
 * يشغّل receiver فقط بعد اكتمال العقد. لا يُستدعى عند import، ولا ينشئ أي sink عند
 * التعطيل؛ لذلك يبقى POST مغلقاً بـ503 بينما تبقى healthz إشارة عملية فقط، لا اتصال DB.
 */
export async function startReceiver({
  env = process.env,
  createAccessTokenProvider = createGoogleAccessTokenProvider,
  createSink = createSheetsSink,
  createServer = http.createServer,
  logger = console,
} = {}) {
  const runtime = loadReceiverRuntimeContract(env);
  let sink;
  let receiverConfig = { enabled: false };

  if (runtime.enabled) {
    const getAccessToken = await createAccessTokenProvider();
    sink = createSink({
      spreadsheetId: runtime.stagingSpreadsheetId,
      sheetName: runtime.stagingLeadsSheet,
      getAccessToken,
    });
    receiverConfig = {
      enabled: true,
      audience: runtime.audience,
      allowedServiceAccountEmails: runtime.allowedServiceAccountEmails,
      allowedSourcePages: runtime.allowedSourcePages,
      consentVersion: runtime.consentVersion,
    };
  }

  const server = createServer(createCloudRunReceiver({ config: receiverConfig, sink, logger }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(runtime.port, '0.0.0.0', resolve);
  });
  if (logger && typeof logger.info === 'function') logger.info({ event: 'bridge_receiver_listening' });
  return server;
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  startReceiver().catch(() => {
    // لا تكشف configuration أو spreadsheet أو audience أو تفاصيل اعتماد في logs.
    console.error(JSON.stringify({ event: 'bridge_receiver_startup_failed' }));
    process.exitCode = 1;
  });
}
