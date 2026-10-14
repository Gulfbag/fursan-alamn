import http from 'node:http';
import { createApp } from '../app.mjs';
import { loadConfig } from '../config.mjs';
import { loadDeploymentProfile } from '../deployment-profile.mjs';
import { createAdcIdTokenProvider, createCloudRunWebsiteSink } from '../integration/cloud-run-website-sink.mjs';
import { createGoogleAccessTokenProvider, createSheetsSink } from '../sheets-sink.mjs';
import { loadOperationsConfig } from '../operations/config.mjs';
import { createOperationsHandler } from '../operations/http.mjs';

const deployment = loadDeploymentProfile(process.env, { expected: 'combined' });
const config = loadConfig();
let sink;
if (config.mode === 'sheets') {
  try {
    const getAccessToken = await createGoogleAccessTokenProvider();
    sink = createSheetsSink({ spreadsheetId: config.spreadsheetId, sheetName: config.leadsSheet, getAccessToken });
  } catch {
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
    console.error(JSON.stringify({ event: 'lead_sink_initialization_failed' }));
  }
}
if (!config.leadSubmissionEnabled) {
  console.warn(JSON.stringify({ event: 'lead_submission_disabled', configurationErrors: config.configurationErrors }));
}
let operationsConfig;
try {
  operationsConfig = loadOperationsConfig();
} catch {
  console.error(JSON.stringify({ event: 'operations_configuration_rejected' }));
  throw new Error('Operations startup configuration invalid; deployment rejected');
}
const app = createApp({
  config,
  sink,
  operationsHandler: createOperationsHandler({ config: operationsConfig }),
  staticRoot: process.cwd(),
});
const server = http.createServer(app);
server.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'server_listening', profile: deployment.profile, port: config.port, mode: config.mode }));
});
