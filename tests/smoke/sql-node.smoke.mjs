import { runSmoke } from './run-smoke.mjs';

await runSmoke({
  serverName: 'sql-node',
  command: process.execPath,
  args: ['sql-node/index.js']
});
