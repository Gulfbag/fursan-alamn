import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { cspForHtml, sendJson, sendNotFound, serveStatic, setSecurityHeaders, staticRelativePath } from './http-static.mjs';
import {
  MAX_LEAD_BODY_BYTES,
  RequestError,
  contentTypeIsJson,
  createMemoryRateLimiter,
  readJsonBody,
  validateLeadPayload,
} from './validation.mjs';

function requestOriginAllowed(request, appOrigin) {
  if (!appOrigin) return true;
  return request.headers.origin === appOrigin;
}

function logEvent(logger, event) {
  // لا تسجل body أو البريد أو الهاتف أو الاسم أو عنوان IP.
  if (logger && typeof logger.info === 'function') logger.info(event);
}

/**
 * ينشأ التطبيق مع sink قابل للحقن لكي تبقى اختبارات الوحدة بلا شبكة أو ADC.
 */
export function createApp({ config, sink, operationsHandler, staticRoot = process.cwd(), now = () => new Date(), logger = console, rateLimiter, allowStaticPath } = {}) {
  if (!config) throw new TypeError('config is required');
  const limiter = rateLimiter || createMemoryRateLimiter(config.rateLimit);
  const resolvedStaticRoot = path.resolve(staticRoot);

  return async function app(request, response) {
    setSecurityHeaders(response, '', config.appEnv);
    const url = new URL(request.url, 'http://localhost');

    if (operationsHandler && await operationsHandler(request, response)) return;

    if (request.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(response, 200, { status: 'ok' });
    }

    if (request.method === 'GET' && url.pathname === '/api/public-config') {
      return sendJson(response, 200, {
        leadSubmissionEnabled: Boolean(config.leadSubmissionEnabled),
        mode: config.mode,
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/leads') {
      if (!config.leadSubmissionEnabled || !sink) {
        return sendJson(response, 503, { error: 'lead_submission_unavailable' });
      }
      if (!requestOriginAllowed(request, config.appOrigin)) {
        return sendJson(response, 403, { error: 'origin_not_allowed' });
      }
      if (!contentTypeIsJson(request.headers['content-type'])) {
        request.resume();
        return sendJson(response, 415, { error: 'unsupported_media_type' });
      }

      const rate = limiter.take(request.socket.remoteAddress || 'unknown');
      if (!rate.allowed) {
        request.resume();
        return sendJson(response, 429, { error: 'rate_limited' }, { 'retry-after': String(rate.retryAfterSeconds) });
      }

      let payload;
      try {
        payload = await readJsonBody(request, MAX_LEAD_BODY_BYTES);
      } catch (error) {
        if (error instanceof RequestError) return sendJson(response, error.statusCode, { error: error.code });
        return sendJson(response, 400, { error: 'invalid_request' });
      }

      const result = validateLeadPayload(payload, { now: now(), allowedSourcePages: config.allowedSourcePages });
      if (!result.valid) return sendJson(response, 400, { error: 'invalid_request', fields: result.errors });

      const requestId = randomUUID();
      const lead = Object.freeze({
        requestId,
        createdAt: now().toISOString(),
        ...result.value,
        consentVersion: config.consentVersion,
        status: 'new',
      });

      try {
        const appendResult = await sink.append(lead);
        if (appendResult?.updatedRows !== 1) throw new Error('unexpected_append_result');
      } catch {
        logEvent(logger, { event: 'lead_sink_failed', requestId, sourcePage: result.value.sourcePage });
        return sendJson(response, 502, { error: 'lead_submission_failed', requestId });
      }

      logEvent(logger, { event: 'lead_submission_accepted', requestId, sourcePage: result.value.sourcePage });
      return sendJson(response, 201, { requestId, status: 'accepted' });
    }

    if (request.method === 'GET' && url.pathname === '/robots.txt' && config.appEnv === 'staging') {
      response.statusCode = 200;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
      return response.end('User-agent: *\nDisallow: /\n');
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      return serveStatic(request, response, resolvedStaticRoot, { appEnv: config.appEnv, allowRelativePath: allowStaticPath });
    }

    return sendNotFound(response);
  };
}

export { cspForHtml, staticRelativePath };
