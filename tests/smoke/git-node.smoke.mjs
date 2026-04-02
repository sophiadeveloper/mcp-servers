import { runSmoke } from './run-smoke.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

function setupTempRepo() {
  const repoPath = mkdtempSync(join(tmpdir(), 'git-node-smoke-'));
  execSync('git init', { cwd: repoPath, stdio: 'ignore' });
  execSync('git config user.email "smoke@example.com"', { cwd: repoPath, stdio: 'ignore' });
  execSync('git config user.name "Smoke Test"', { cwd: repoPath, stdio: 'ignore' });
  writeFileSync(join(repoPath, 'README.md'), '# smoke\n', 'utf8');
  execSync('git add README.md && git commit -m "init"', { cwd: repoPath, stdio: 'ignore' });
  writeFileSync(join(repoPath, 'feature.txt'), 'v1\n', 'utf8');
  execSync('git add feature.txt && git commit -m "feature-1"', { cwd: repoPath, stdio: 'ignore' });
  return repoPath;
}

await runSmoke({
  serverName: 'git-node',
  command: process.execPath,
  args: ['git-node/index.js'],
  afterInitialize: async ({ request }) => {
    const repoPath = setupTempRepo();

    const historyResult = await request('tools/call', {
      name: 'git_query',
      arguments: {
        action: 'history',
        roots: [repoPath]
      }
    });

    if (historyResult?.isError) {
      throw new Error(`git_query history returned isError: ${JSON.stringify(historyResult)}`);
    }

    if (!historyResult?.structuredContent?.commits?.length) {
      throw new Error(`git_query history missing structured commits: ${JSON.stringify(historyResult)}`);
    }

    const repoInfoResult = await request('tools/call', {
      name: 'git_query',
      arguments: {
        action: 'repo_info',
        project_path: repoPath
      }
    });
    if (repoInfoResult?.isError || !repoInfoResult?.structuredContent?.repo?.top_level) {
      throw new Error(`git_query repo_info failed: ${JSON.stringify(repoInfoResult)}`);
    }

    const rebaseStatusResult = await request('tools/call', {
      name: 'git_query',
      arguments: {
        action: 'rebase_status',
        project_path: repoPath
      }
    });
    if (rebaseStatusResult?.isError || rebaseStatusResult?.structuredContent?.rebase_status?.in_progress !== false) {
      throw new Error(`git_query rebase_status failed: ${JSON.stringify(rebaseStatusResult)}`);
    }

    const compareResult = await request('tools/call', {
      name: 'git_diff',
      arguments: {
        action: 'compare',
        project_path: repoPath,
        target: 'HEAD~1',
        source: 'HEAD',
        diff_mode: 'two_dot',
        stat: true
      }
    });
    if (compareResult?.isError || compareResult?.structuredContent?.diff_mode !== 'two_dot') {
      throw new Error(`git_diff compare(two_dot/stat) failed: ${JSON.stringify(compareResult)}`);
    }

    const rangeDiffResult = await request('tools/call', {
      name: 'git_diff',
      arguments: {
        action: 'range_diff',
        project_path: repoPath,
        original_range: 'HEAD~1..HEAD',
        rewritten_range: 'HEAD~1..HEAD'
      }
    });
    if (rangeDiffResult?.isError || rangeDiffResult?.structuredContent?.action !== 'range_diff') {
      throw new Error(`git_diff range_diff failed: ${JSON.stringify(rangeDiffResult)}`);
    }
    if (!rangeDiffResult?.structuredContent?.range_summary || !rangeDiffResult?.structuredContent?.semantic_hint) {
      throw new Error(`git_diff range_diff missing semantic fields: ${JSON.stringify(rangeDiffResult)}`);
    }

    const listDetailedResult = await request('tools/call', {
      name: 'git_conflict_manager',
      arguments: {
        action: 'list_detailed',
        project_path: repoPath
      }
    });
    if (listDetailedResult?.isError || !Array.isArray(listDetailedResult?.structuredContent?.conflicts)) {
      throw new Error(`git_conflict_manager list_detailed failed: ${JSON.stringify(listDetailedResult)}`);
    }

    const resolveResult = await request('tools/call', {
      name: 'git_conflict_manager',
      arguments: {
        action: 'resolve',
        project_path: repoPath,
        file_path: 'README.md',
        resolved_content: '# smoke updated\n'
      }
    });

    if (resolveResult?.isError || resolveResult?.structuredContent?.saved !== true) {
      throw new Error(`git_conflict_manager resolve failed: ${JSON.stringify(resolveResult)}`);
    }

    const fileContent = readFileSync(join(repoPath, 'README.md'), 'utf8');
    if (!fileContent.includes('updated')) {
      throw new Error('git_conflict_manager resolve did not update README.md');
    }
  }
});
