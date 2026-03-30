import { runSmoke } from './run-smoke.mjs';

await runSmoke({
  serverName: 'docs-node',
  command: process.execPath,
  args: ['docs-node/index.js']
});
