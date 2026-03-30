import fs from 'node:fs';
import { runSmoke } from './run-smoke.mjs';

const hasDist = fs.existsSync('linter-node/dist/index.js');

await runSmoke({
  serverName: 'linter-node',
  command: process.execPath,
  args: hasDist
    ? ['linter-node/dist/index.js']
    : ['linter-node/node_modules/tsx/dist/cli.mjs', 'linter-node/src/index.ts']
});
