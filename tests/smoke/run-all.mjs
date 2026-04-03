import { spawn } from 'node:child_process';

const smokeFiles = [
  'git-node.smoke.mjs',
  'sql-node.smoke.mjs',
  'mantis-node.smoke.mjs',
  'cf-node.smoke.mjs',
  'docs-node.smoke.mjs',
  'office-node.smoke.mjs',
  'office-docs-bridge.smoke.mjs',
  'playwright-node.smoke.mjs',
  'linter-node.smoke.mjs'
];

let failed = 0;

for (const smokeFile of smokeFiles) {
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [`tests/smoke/${smokeFile}`], { stdio: 'inherit' });
    child.once('exit', (code) => {
      if (code !== 0) failed += 1;
      resolve();
    });
  });
}

if (failed > 0) {
  console.error(`\n${failed} smoke test(s) failed.`);
  process.exit(1);
}

console.log('\nAll smoke tests passed.');
