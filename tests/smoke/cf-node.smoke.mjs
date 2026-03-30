import { runSmoke } from './run-smoke.mjs';

await runSmoke({
  serverName: 'cf-node',
  command: process.execPath,
  args: ['cf-node/index.js']
});
