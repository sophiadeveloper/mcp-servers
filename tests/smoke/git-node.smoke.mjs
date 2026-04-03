import { runSmoke } from './run-smoke.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const EXPECTED_PROMPTS = {
  git_review_workflow: {
    required: ['project_path'],
    optional: ['source_branch', 'target_branch'],
    arguments: {
      project_path: '/tmp/example-repo',
      source_branch: 'feature/refactor',
      target_branch: 'origin/main'
    },
    contains: ['git_diff(action=compare', 'feature/refactor']
  },
  triage_bug_ticket: {
    required: ['ticket_id', 'project_path'],
    optional: ['focus_area'],
    arguments: {
      ticket_id: 'MANTIS-42',
      project_path: '/tmp/example-repo',
      focus_area: 'billing'
    },
    contains: ['MANTIS-42', "usa billing come priorita'"]
  },
  post_fix_validation: {
    required: ['project_path'],
    optional: ['source_branch', 'target_branch'],
    arguments: {
      project_path: '/tmp/example-repo',
      source_branch: 'bugfix/42',
      target_branch: 'origin/release'
    },
    contains: ['bugfix/42 vs origin/release', 'smoke o check disponibili']
  },
  ingest_pdf_into_docs: {
    required: ['pdf_path', 'shelf_name', 'doc_title'],
    optional: [],
    arguments: {
      pdf_path: '/tmp/test.pdf',
      shelf_name: 'qa-shelf',
      doc_title: 'Ticket 42 analysis'
    },
    contains: ['/tmp/test.pdf', 'qa-shelf', 'Ticket 42 analysis']
  },
  git_conflict_resolution_plan: {
    required: ['project_path'],
    optional: ['file_path', 'rebase_action'],
    arguments: {
      project_path: '/tmp/example-repo',
      file_path: 'src/conflict.php',
      rebase_action: 'skip'
    },
    contains: ['file_path="src/conflict.php"', 'rebase_action="skip"']
  }
};

function validatePromptMetadata(promptsList) {
  if (!Array.isArray(promptsList?.prompts)) {
    throw new Error(`prompts/list invalid payload: ${JSON.stringify(promptsList)}`);
  }

  const byName = new Map(promptsList.prompts.map((prompt) => [prompt?.name, prompt]));
  const expectedNames = Object.keys(EXPECTED_PROMPTS);
  for (const name of expectedNames) {
    if (!byName.has(name)) {
      throw new Error(`prompts/list missing expected prompt "${name}": ${JSON.stringify(promptsList)}`);
    }
  }

  for (const [name, expected] of Object.entries(EXPECTED_PROMPTS)) {
    const prompt = byName.get(name);
    if (!Array.isArray(prompt?.arguments)) {
      throw new Error(`prompts/list ${name} missing arguments array: ${JSON.stringify(prompt)}`);
    }
    const argumentNames = new Set(prompt.arguments.map((arg) => arg?.name));

    for (const requiredName of expected.required) {
      const argument = prompt.arguments.find((arg) => arg?.name === requiredName);
      if (!argument || argument.required !== true) {
        throw new Error(`prompts/list ${name} required arg "${requiredName}" invalid: ${JSON.stringify(prompt)}`);
      }
    }

    for (const optionalName of expected.optional) {
      const argument = prompt.arguments.find((arg) => arg?.name === optionalName);
      if (!argument || argument.required !== false) {
        throw new Error(`prompts/list ${name} optional arg "${optionalName}" invalid: ${JSON.stringify(prompt)}`);
      }
    }

    const expectedArgCount = expected.required.length + expected.optional.length;
    if (argumentNames.size !== expectedArgCount || prompt.arguments.length !== expectedArgCount) {
      throw new Error(`prompts/list ${name} unexpected arguments shape: ${JSON.stringify(prompt)}`);
    }
  }
}

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
    validatePromptMetadata(promptsList);

    for (const [promptName, expected] of Object.entries(EXPECTED_PROMPTS)) {
      const promptResult = await request('prompts/get', {
        name: promptName,
        arguments: expected.arguments
      });
      const promptText = promptResult?.messages?.[0]?.content?.text || '';
      if (!promptResult?.description || !Array.isArray(promptResult?.messages) || promptResult.messages.length === 0) {
        throw new Error(`prompts/get ${promptName} invalid envelope: ${JSON.stringify(promptResult)}`);
      }
      for (const fragment of expected.contains) {
        if (!promptText.includes(fragment)) {
          throw new Error(`prompts/get ${promptName} missing expected fragment "${fragment}": ${JSON.stringify(promptResult)}`);
        }
      }
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
