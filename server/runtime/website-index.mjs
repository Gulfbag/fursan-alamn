import http from 'node:http';
import { loadConfig } from '../config.mjs';
import { loadDeploymentProfile } from '../deployment-profile.mjs';
import { createWebsiteApp } from '../website-app.mjs';

const deployment = loadDeploymentProfile(process.env, { expected: 'website' });
const config = loadConfig();
if (!config.leadSubmissionEnabled) {
  console.warn(JSON.stringify({ event: 'lead_submission_disabled', configurationErrors: config.configurationErrors }));
}
const app = createWebsiteApp({ config, staticRoot: process.cwd() });
const server = http.createServer(app);
server.listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'server_listening', profile: deployment.profile, port: config.port, mode: config.mode }));
});
