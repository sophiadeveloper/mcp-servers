import { runSmoke } from './run-smoke.mjs';

await runSmoke({
  serverName: 'office-node',
  command: process.execPath,
  args: ['office-node/index.js']
});
