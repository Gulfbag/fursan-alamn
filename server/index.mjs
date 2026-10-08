import http from 'node:http';
import { createApp } from './app.mjs';
import { loadConfig } from './config.mjs';
import { createAdcIdTokenProvider, createCloudRunWebsiteSink } from './integration/cloud-run-website-sink.mjs';
import { createGoogleAccessTokenProvider, createSheetsSink } from './sheets-sink.mjs';

const config = loadConfig();
let sink;

if (config.mode === 'sheets') {
  try {
    const getAccessToken = await createGoogleAccessTokenProvider();
    sink = createSheetsSink({
      spreadsheetId: config.spreadsheetId,
      sheetName: config.leadsSheet,
      getAccessToken,
    });
  } catch {
    // لا نطبع تفاصيل اعتماد أو أسماء أسرار؛ تبقى API بحالة 503 صادقة.
    console.error(JSON.stringify({ event: 'lead_sink_initialization_failed' }));
  }
} else if (config.mode === 'bridge') {
  try {
    const getIdToken = await createAdcIdTokenProvider();
    sink = createCloudRunWebsiteSink({
      origin: config.bridge.origin,
      audience: config.bridge.audience,
      allowedOrigins: config.bridge.allowedOrigins,
      getIdToken,
    });
  } catch {
    // لا نكشف URL أو audience أو تفاصيل ADC؛ يبقى endpoint العام 503 بأمان.
    console.error(JSON.stringify({ event: 'lead_sink_initialization_failed' }));
  }
}

if (!config.leadSubmissionEnabled) {
  console.warn(JSON.stringify({
    event: 'lead_submission_disabled',
    configurationErrors: config.configurationErrors,
  }));
}

const app = createApp({ config, sink, staticRoot: process.cwd() });
const server = http.createServer(app);

server.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'server_listening', port: config.port, mode: config.mode }));
});
