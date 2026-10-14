import { loadDeploymentProfile } from './deployment-profile.mjs';

const { profile } = loadDeploymentProfile();
await import(`./runtime/${profile}-index.mjs`);
