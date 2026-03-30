import { runSmoke } from './run-smoke.mjs';

await runSmoke({
  serverName: 'playwright-node',
  command: process.execPath,
  args: ['playwright-node/index.js'],
  env: {
    ALLOWED_URLS: '*',
    BLOCK_MEDIA: 'false'
  }
});
