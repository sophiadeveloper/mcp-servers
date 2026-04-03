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
  writeFileSync(join(repoPath, 'maintenance.php'), '<?php echo "keep";\n', 'utf8');
  writeFileSync(join(repoPath, 'shared.txt'), 'base\n', 'utf8');
  writeFileSync(join(repoPath, 'identical.txt'), 'same\n', 'utf8');
  execSync('git add . && git commit -m "init"', { cwd: repoPath, stdio: 'ignore' });
  execSync('git checkout -B master', { cwd: repoPath, stdio: 'ignore' });
  writeFileSync(join(repoPath, 'shared.txt'), 'left-change\n', 'utf8');
  execSync('git add shared.txt && git commit -m "left-update"', { cwd: repoPath, stdio: 'ignore' });
  execSync('git checkout -b upgrade HEAD~1', { cwd: repoPath, stdio: 'ignore' });
  execSync('git rm maintenance.php', { cwd: repoPath, stdio: 'ignore' });
  writeFileSync(join(repoPath, 'shared.txt'), 'right-change\n', 'utf8');
  execSync('git add shared.txt && git commit -m "right-update"', { cwd: repoPath, stdio: 'ignore' });
  return { repoPath, leftRef: 'master', rightRef: 'upgrade' };
}

await runSmoke({
  serverName: 'git-node',
  command: process.execPath,
  args: ['git-node/index.js'],
  afterInitialize: async ({ request }) => {
    const promptsList = await request('prompts/list', {});
    if (!Array.isArray(promptsList?.prompts) || promptsList.prompts.length < 5) {
      throw new Error(`prompts/list missing expected prompts: ${JSON.stringify(promptsList)}`);
    }

    const reviewPrompt = await request('prompts/get', {
      name: 'git_review_workflow',
      arguments: {
        project_path: '/tmp/example-repo',
        source_branch: 'feature/refactor',
        target_branch: 'origin/main'
      }
    });
    const reviewText = reviewPrompt?.messages?.[0]?.content?.text || '';
    if (!reviewText.includes('git_diff(action=compare') || !reviewText.includes('feature/refactor')) {
      throw new Error(`prompts/get git_review_workflow payload invalid: ${JSON.stringify(reviewPrompt)}`);
    }

    const triagePrompt = await request('prompts/get', {
      name: 'triage_bug_ticket',
      arguments: {
        ticket_id: 'MANTIS-42',
        project_path: '/tmp/example-repo'
      }
    });
    const triageText = triagePrompt?.messages?.[0]?.content?.text || '';
    if (!triageText.includes('MANTIS-42') || !triageText.includes('piano minimo')) {
      throw new Error(`prompts/get triage_bug_ticket payload invalid: ${JSON.stringify(triagePrompt)}`);
    }

    const { repoPath, leftRef, rightRef } = setupTempRepo();

    const historyResult = await request('tools/call', {
      name: 'git_query',
      arguments: {
        action: 'history',
        roots: [repoPath],
        commit_ref: leftRef,
        max_count: 1
      }
    });

    if (historyResult?.isError) {
      throw new Error(`git_query history returned isError: ${JSON.stringify(historyResult)}`);
    }

    if (!historyResult?.structuredContent?.commits?.length) {
      throw new Error(`git_query history missing structured commits: ${JSON.stringify(historyResult)}`);
    }

    const statusResult = await request('tools/call', {
      name: 'git_query',
      arguments: {
        action: 'status',
        project_path: repoPath
      }
    });
    if (statusResult?.isError || !Array.isArray(statusResult?.structuredContent?.entries)) {
      throw new Error(`git_query status missing structured entries: ${JSON.stringify(statusResult)}`);
    }
    const isClean = statusResult?.structuredContent?.entries?.length === 0;
    if (statusResult?.structuredContent?.clean !== isClean) {
      throw new Error(`git_query status clean flag mismatch: ${JSON.stringify(statusResult)}`);
    }
    const leftHistoryTip = historyResult?.structuredContent?.commits?.[0]?.hash;
    const leftParentRef = `${leftHistoryTip}^`;

    const commitInfoResult = await request('tools/call', {
      name: 'git_query',
      arguments: {
        action: 'commit_info',
        project_path: repoPath,
        commit_ref: leftRef
      }
    });
    if (commitInfoResult?.isError || !commitInfoResult?.structuredContent?.commit?.short_hash) {
      throw new Error(`git_query commit_info failed: ${JSON.stringify(commitInfoResult)}`);
    }
    if (commitInfoResult.structuredContent.commit.short_hash !== leftHistoryTip) {
      throw new Error(`history(${leftRef}) and commit_info(${leftRef}) are not aligned`);
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
    if (rebaseStatusResult?.structuredContent?.rebase_status?.current_index !== null || rebaseStatusResult?.structuredContent?.rebase_status?.total_commits !== null) {
      throw new Error(`git_query rebase_status should expose stable null counters when idle: ${JSON.stringify(rebaseStatusResult)}`);
    }

    const compareResult = await request('tools/call', {
      name: 'git_diff',
      arguments: {
        action: 'compare',
        project_path: repoPath,
        source: leftRef,
        target: rightRef,
        diff_mode: 'two_dot',
        stat: true,
        file_path: 'maintenance.php'
      }
    });
    if (compareResult?.isError || compareResult?.structuredContent?.diff_mode !== 'two_dot') {
      throw new Error(`git_diff compare(two_dot/stat) failed: ${JSON.stringify(compareResult)}`);
    }
    const fileMeta = compareResult?.structuredContent?.files?.find((f) => f.path === 'maintenance.php');
    if (!fileMeta || fileMeta.change_type !== 'D' || fileMeta.exists_in_left !== true || fileMeta.exists_in_right !== false) {
      throw new Error(`git_diff compare metadata mismatch: ${JSON.stringify(compareResult)}`);
    }
    if (String(compareResult?.structuredContent?.output || '').includes('new file mode')) {
      throw new Error(`git_diff compare should not mark maintenance.php as new file: ${JSON.stringify(compareResult)}`);
    }

    const compareModified = await request('tools/call', {
      name: 'git_diff',
      arguments: {
        action: 'compare',
        project_path: repoPath,
        source: leftRef,
        target: rightRef,
        diff_mode: 'two_dot',
        file_path: 'shared.txt'
      }
    });
    const sharedMeta = compareModified?.structuredContent?.files?.find((f) => f.path === 'shared.txt');
    if (compareModified?.isError || !sharedMeta || sharedMeta.change_type !== 'M') {
      throw new Error(`git_diff compare shared.txt metadata mismatch: ${JSON.stringify(compareModified)}`);
    }

    const compareIdentical = await request('tools/call', {
      name: 'git_diff',
      arguments: {
        action: 'compare',
        project_path: repoPath,
        source: leftRef,
        target: rightRef,
        diff_mode: 'two_dot',
        file_path: 'identical.txt'
      }
    });
    if (compareIdentical?.isError || compareIdentical?.structuredContent?.has_diff !== false) {
      throw new Error(`git_diff compare identical.txt should have no diff: ${JSON.stringify(compareIdentical)}`);
    }

    const compareExplicitRefs = await request('tools/call', {
      name: 'git_diff',
      arguments: {
        action: 'compare',
        project_path: repoPath,
        left_ref: leftParentRef,
        right_ref: leftHistoryTip,
        diff_mode: 'two_dot',
        stat: true
      }
    });
    if (compareExplicitRefs?.isError || compareExplicitRefs?.structuredContent?.has_diff !== true) {
      throw new Error(`git_diff compare explicit refs failed: ${JSON.stringify(compareExplicitRefs)}`);
    }
    const explicitFiles = compareExplicitRefs?.structuredContent?.files || [];
    if (!explicitFiles.find((f) => f.path === 'shared.txt' && f.change_type === 'M')) {
      throw new Error(`git_diff compare explicit refs missing shared.txt metadata: ${JSON.stringify(compareExplicitRefs)}`);
    }

    const rangeDiffResult = await request('tools/call', {
      name: 'git_diff',
      arguments: {
        action: 'range_diff',
        project_path: repoPath,
        original_range: `${leftRef}~1..${leftRef}`,
        rewritten_range: `${leftRef}~1..${leftRef}`
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
