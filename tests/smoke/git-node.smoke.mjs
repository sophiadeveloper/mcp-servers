import { runSmoke } from './run-smoke.mjs';

await runSmoke({
  serverName: 'git-node',
  command: process.execPath,
  args: ['git-node/index.js']
});
