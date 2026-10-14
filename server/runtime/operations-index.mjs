import http from 'node:http';
import { loadDeploymentProfile } from '../deployment-profile.mjs';
import { createOperationsApp } from '../operations-app.mjs';
import { loadOperationsConfig } from '../operations/config.mjs';
import { createOperationsHandler } from '../operations/http.mjs';

const deployment = loadDeploymentProfile(process.env, { expected: 'operations' });
let config;
try {
  config = loadOperationsConfig();
} catch {
  console.error(JSON.stringify({ event: 'operations_configuration_rejected' }));
  throw new Error('Operations startup configuration invalid; deployment rejected');
}
const app = createOperationsApp({
  config,
  operationsHandler: createOperationsHandler({ config }),
  staticRoot: process.cwd(),
});
const server = http.createServer(app);
server.listen(positivePort(process.env.PORT), '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'server_listening', profile: deployment.profile, port: positivePort(process.env.PORT), mode: config.deploymentMode }));
});

function positivePort(value) {
  const parsed = Number.parseInt(value || '8080', 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 8080;
}
