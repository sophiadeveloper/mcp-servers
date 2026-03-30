import { runSmoke } from './run-smoke.mjs';

await runSmoke({
  serverName: 'mantis-node',
  command: process.execPath,
  args: ['mantis-node/index.js']
});
