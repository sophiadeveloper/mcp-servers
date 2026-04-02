#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";

const execAsync = util.promisify(exec);
const SERVER_INSTRUCTIONS = [
  "Questo server MCP espone utility Git per analisi e gestione conflitti su repository locali.",
  "Usa project_path per puntare alla root del repository target; se non disponibile puoi passare roots come fallback compatibile.",
  "Preferisci prima i tool read-only (git_query, git_diff) e usa git_conflict_manager solo per operazioni di modifica esplicite.",
  "Per client moderni vengono restituiti sia content testuale sia structuredContent; i client legacy possono usare solo content."
].join(" ");

const TOOL_METADATA = {
  git_query: {
    description: "Esplora lo stato e la storia del repository Git (Sola Lettura).",
    annotations: {
      title: "Git Query (Read-Only)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  git_diff: {
    description: "Visualizza le differenze tra stati del repository.",
    annotations: {
      title: "Git Diff (Read-Only)",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true
    }
  },
  git_conflict_manager: {
    description: "Gestisce il ciclo di vita dei conflitti di merge e operazioni di scrittura.",
    annotations: {
      title: "Git Conflict Manager",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false
    }
  }
};

function toLegacyText(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function makeSuccessResult({ text, structuredContent }) {
  return {
    content: [{ type: "text", text: toLegacyText(text) }],
    structuredContent
  };
}

function makeErrorResult(error, context = {}) {
  return {
    content: [{ type: "text", text: `❌ Errore: ${error.message}` }],
    structuredContent: {
      ok: false,
      error: error.message,
      context
    },
    isError: true
  };
}

function resolveProjectPath(args = {}) {
  if (typeof args.project_path === "string" && args.project_path.trim() !== "") {
    return args.project_path;
  }

  if (Array.isArray(args.roots) && args.roots.length > 0) {
    const rootIndex = Number.isInteger(args.root_index) ? args.root_index : 0;
    const selectedRoot = args.roots[rootIndex];
    if (typeof selectedRoot === "string" && selectedRoot.trim() !== "") {
      return selectedRoot;
    }
  }

  throw new Error("Parametro mancante: specifica project_path oppure roots[].");
}

function shellQuote(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

function parseCommitRange(value) {
  const normalized = String(value || "").trim();
  const dotsIndex = normalized.indexOf("..");
  if (dotsIndex === -1) return null;

  const left = normalized.slice(0, dotsIndex).trim();
  const right = normalized.slice(dotsIndex + (normalized.startsWith("...", dotsIndex) ? 3 : 2)).trim();
  if (!left || !right) return null;
  return { left, right, raw: normalized };
}

function parseRangeDiffOutput(rangeDiffOut) {
  const summary = {
    unchanged: 0,
    changed: 0,
    only_left: 0,
    only_right: 0,
    left_only_commits: [],
    right_only_commits: [],
    changed_pairs: []
  };

  if (!rangeDiffOut || !rangeDiffOut.trim()) return summary;

  const lines = rangeDiffOut.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const leftOnlyMatch = trimmed.match(/^\d+:\s+([0-9a-f]+)\s+<\s+-:/i);
    if (leftOnlyMatch) {
      summary.only_left += 1;
      summary.left_only_commits.push(leftOnlyMatch[1]);
      continue;
    }

    const rightOnlyMatch = trimmed.match(/^-:\s+[-.]+\s+>\s+\d+:\s+([0-9a-f]+)/i);
    if (rightOnlyMatch) {
      summary.only_right += 1;
      summary.right_only_commits.push(rightOnlyMatch[1]);
      continue;
    }

    const unchangedMatch = trimmed.match(/^\d+:\s+([0-9a-f]+)\s+=\s+\d+:\s+([0-9a-f]+)/i);
    if (unchangedMatch) {
      summary.unchanged += 1;
      continue;
    }

    const changedMatch = trimmed.match(/^\d+:\s+([0-9a-f]+)\s+!\s+\d+:\s+([0-9a-f]+)/i);
    if (changedMatch) {
      summary.changed += 1;
      summary.changed_pairs.push({
        original_commit: changedMatch[1],
        rewritten_commit: changedMatch[2]
      });
    }
  }

  return summary;
}

function buildRangeDiffHint(summary) {
  if (summary.only_left > 0 && summary.only_right === 0 && summary.unchanged === 0 && summary.changed === 0) {
    return "Le commit risultano presenti solo nel range originale: verifica che rewritten_range punti al branch rebased corretto e che i due range siano equivalenti.";
  }
  if (summary.only_left === 0 && summary.only_right === 0 && summary.changed === 0) {
    return "Le serie di commit sembrano equivalenti.";
  }
  if (summary.changed > 0 && summary.only_left === 0 && summary.only_right === 0) {
    return "Le commit sono abbinate ma modificate: possibile reword/edit/squash parziale.";
  }
  return "Output con differenze miste: controlla commit solo a sinistra/destra e coppie cambiate per validare la semantica del confronto.";
}
async function runGitSafe(command, projectPath) {
  try {
    return await runGit(command, projectPath);
  } catch {
    return "";
  }
}

async function getGitDir(projectPath) {
  const gitDirRaw = await runGit("rev-parse --git-dir", projectPath);
  return path.resolve(projectPath, gitDirRaw);
}

async function ensureResolvableRef(ref, projectPath, argName = "ref") {
  const normalizedRef = String(ref || "").trim();
  if (!normalizedRef) {
    throw new Error(`${argName} non valido: valore vuoto.`);
  }

  try {
    await runGit(`rev-parse --verify ${shellQuote(`${normalizedRef}^{commit}`)}`, projectPath);
  } catch {
    throw new Error(`${argName} non risolvibile: ${normalizedRef}`);
  }

  return normalizedRef;
}

async function fileExistsInRef(ref, filePath, projectPath) {
  try {
    await runGit(`cat-file -e ${shellQuote(`${ref}:${filePath}`)}`, projectPath);
    return true;
  } catch {
    return false;
  }
}

function parseNameStatus(output) {
  if (!output || !output.trim()) return [];

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const code = parts[0] || "";
      const fromPath = parts[1] || null;
      const toPath = parts[2] || fromPath;
      return {
        raw_status: code,
        change_type: code.charAt(0) || "M",
        from_path: fromPath,
        to_path: toPath,
        path: toPath || fromPath || null
      };
    });
}

function detectBomAndEncoding(fileBuffer) {
  if (!fileBuffer || fileBuffer.length === 0) {
    return { has_bom: false, bom: null, encoding_hint: "utf-8/unknown" };
  }

  if (fileBuffer.length >= 3 && fileBuffer[0] === 0xef && fileBuffer[1] === 0xbb && fileBuffer[2] === 0xbf) {
    return { has_bom: true, bom: "UTF-8", encoding_hint: "utf-8" };
  }
  if (fileBuffer.length >= 2 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe) {
    return { has_bom: true, bom: "UTF-16LE", encoding_hint: "utf-16le" };
  }
  if (fileBuffer.length >= 2 && fileBuffer[0] === 0xfe && fileBuffer[1] === 0xff) {
    return { has_bom: true, bom: "UTF-16BE", encoding_hint: "utf-16be" };
  }
  return { has_bom: false, bom: null, encoding_hint: "utf-8/unknown" };
}

function inspectConflictMarkers(fileText) {
  const lines = fileText.split(/\r?\n/);
  let startMarkers = 0;
  let middleMarkers = 0;
  let endMarkers = 0;
  let diff3BaseMarkers = 0;

  for (const line of lines) {
    if (line.startsWith("<<<<<<<")) startMarkers += 1;
    else if (line.startsWith("=======")) middleMarkers += 1;
    else if (line.startsWith(">>>>>>>")) endMarkers += 1;
    else if (line.startsWith("|||||||")) diff3BaseMarkers += 1;
  }

  return {
    start: startMarkers,
    middle: middleMarkers,
    end: endMarkers,
    diff3_base: diff3BaseMarkers,
    has_markers: startMarkers > 0 || middleMarkers > 0 || endMarkers > 0
  };
}

async function getRepoInfo(projectPath) {
  const topLevel = await runGit("rev-parse --show-toplevel", projectPath);
  const branch = await runGitSafe("symbolic-ref --quiet --short HEAD", projectPath);
  const headHash = await runGitSafe("rev-parse HEAD", projectPath);
  const headShort = await runGitSafe("rev-parse --short HEAD", projectPath);
  const upstream = await runGitSafe("rev-parse --abbrev-ref --symbolic-full-name @{u}", projectPath);
  const gitDir = await getGitDir(projectPath);

  const operations = {
    rebase: fs.existsSync(path.join(gitDir, "rebase-apply")) || fs.existsSync(path.join(gitDir, "rebase-merge")),
    merge: fs.existsSync(path.join(gitDir, "MERGE_HEAD")),
    cherry_pick: fs.existsSync(path.join(gitDir, "CHERRY_PICK_HEAD")),
    bisect: fs.existsSync(path.join(gitDir, "BISECT_LOG"))
  };

  return {
    top_level: topLevel,
    git_dir: gitDir,
    branch: branch || "(detached HEAD)",
    upstream: upstream || null,
    head: {
      hash: headHash || null,
      short_hash: headShort || null
    },
    operations_in_progress: operations
  };
}

async function getRebaseStatus(projectPath) {
  const gitDir = await getGitDir(projectPath);
  const rebaseMergeDir = path.join(gitDir, "rebase-merge");
  const rebaseApplyDir = path.join(gitDir, "rebase-apply");
  const inRebaseMerge = fs.existsSync(rebaseMergeDir);
  const inRebaseApply = fs.existsSync(rebaseApplyDir);
  const inProgress = inRebaseMerge || inRebaseApply;

  if (!inProgress) {
    return {
      in_progress: false,
      mode: null,
      commit_in_replay: null,
      todo_remaining: 0,
      conflict_files: [],
      suggested_next_step: "none"
    };
  }

  const mode = inRebaseMerge ? "rebase-merge" : "rebase-apply";
  const statusDir = inRebaseMerge ? rebaseMergeDir : rebaseApplyDir;
  const currentIndexPath = inRebaseMerge ? path.join(statusDir, "msgnum") : path.join(statusDir, "next");
  const totalPath = inRebaseMerge ? path.join(statusDir, "end") : path.join(statusDir, "last");
  const todoPath = inRebaseMerge ? path.join(statusDir, "git-rebase-todo") : null;

  const currentIndex = fs.existsSync(currentIndexPath) ? Number.parseInt(fs.readFileSync(currentIndexPath, "utf8").trim(), 10) : null;
  const totalCommits = fs.existsSync(totalPath) ? Number.parseInt(fs.readFileSync(totalPath, "utf8").trim(), 10) : null;
  const replayCommit = await runGitSafe("rev-parse --short REBASE_HEAD", projectPath);
  const conflictFilesRaw = await runGitSafe("diff --name-only --diff-filter=U", projectPath);
  const conflictFiles = conflictFilesRaw ? conflictFilesRaw.split("\n").filter(Boolean) : [];

  let todoRemaining = 0;
  if (todoPath && fs.existsSync(todoPath)) {
    const todoLines = fs.readFileSync(todoPath, "utf8").split(/\r?\n/);
    todoRemaining = todoLines.filter((line) => line.trim() && !line.trim().startsWith("#")).length;
  } else if (currentIndex && totalCommits && totalCommits >= currentIndex) {
    todoRemaining = totalCommits - currentIndex + 1;
  }

  let suggestedNextStep = "git rebase --continue";
  if (conflictFiles.length > 0) suggestedNextStep = "resolve_conflicts_then_continue";
  else if (todoRemaining <= 0) suggestedNextStep = "verify_and_continue_or_finish";

  return {
    in_progress: true,
    mode,
    commit_in_replay: replayCommit || null,
    current_index: Number.isFinite(currentIndex) ? currentIndex : null,
    total_commits: Number.isFinite(totalCommits) ? totalCommits : null,
    todo_remaining: todoRemaining,
    conflict_files: conflictFiles,
    suggested_next_step: suggestedNextStep
  };
}

async function listConflictsDetailed(projectPath) {
  const conflictFilesRaw = await runGitSafe("diff --name-only --diff-filter=U", projectPath);
  const conflictFiles = conflictFilesRaw ? conflictFilesRaw.split("\n").filter(Boolean) : [];
  const details = [];

  for (const filePath of conflictFiles) {
    const unmergedRaw = await runGitSafe(`ls-files -u -- "${filePath}"`, projectPath);
    const entries = unmergedRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+([0-9a-f]{40})\s+(\d)\t(.+)$/);
        if (!match) return null;
        return { mode: match[1], object_id: match[2], stage: Number(match[3]), path: match[4] };
      })
      .filter(Boolean);

    const baseEntry = entries.find((entry) => entry.stage === 1) || null;
    const oursEntry = entries.find((entry) => entry.stage === 2) || null;
    const theirsEntry = entries.find((entry) => entry.stage === 3) || null;

    const fullPath = path.join(projectPath, filePath);
    const fileBuffer = fs.existsSync(fullPath) ? fs.readFileSync(fullPath) : Buffer.alloc(0);
    const bomInfo = detectBomAndEncoding(fileBuffer);
    const markerInfo = inspectConflictMarkers(fileBuffer.toString("utf8"));

    let conflictType = "unknown";
    if (baseEntry && oursEntry && theirsEntry) conflictType = "both-modified";
    else if (!baseEntry && oursEntry && theirsEntry) conflictType = "add/add";
    else if (baseEntry && oursEntry && !theirsEntry) conflictType = "deleted-by-theirs";
    else if (baseEntry && !oursEntry && theirsEntry) conflictType = "deleted-by-ours";

    details.push({
      file_path: filePath,
      conflict_type: conflictType,
      entries,
      sides: {
        base: baseEntry,
        ours: oursEntry,
        theirs: theirsEntry
      },
      markers: markerInfo,
      encoding: bomInfo
    });
  }

  return details;
}

const server = new Server(
  { name: "git-node-manager", version: "3.2.0" },
  { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
);

async function runGit(command, projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    throw new Error(`Path del progetto non valido: ${projectPath}`);
  }
  try {
    const { stdout, stderr } = await execAsync(`git ${command}`, {
      cwd: projectPath,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10
    });
    if (stderr && !stdout && !stderr.includes("Switched") && !stderr.includes("Rebase")) {
      console.error(`Git Potential Error: ${stderr}`);
    }
    return stdout ? stdout.trim() : stderr.trim();
  } catch (error) {
    throw new Error(`Git Error: ${error.message}`);
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "git_query",
        description: TOOL_METADATA.git_query.description,
        annotations: TOOL_METADATA.git_query.annotations,
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["status", "history", "list_files", "commit_info", "blame", "check_ancestor", "repo_info", "rebase_status"],
              description: "L'operazione di lettura: 'status', 'history', 'list_files', 'commit_info', 'blame', 'check_ancestor', 'repo_info', 'rebase_status'."
            },
            project_path: { type: "string" },
            roots: {
              type: "array",
              items: { type: "string" },
              description: "Fallback opzionale a project_path: lista roots passate dal client."
            },
            root_index: { type: "number", description: "Indice root da usare (default 0)." },
            file_path: { type: "string" },
            max_count: { type: "number" },
            search_text: { type: "string" },
            search_code: { type: "string" },
            commit_range: { type: "string" },
            commit_ref: { type: "string" },
            ancestor_commit: { type: "string" },
            descendant_commit: { type: "string" },
            start_line: { type: "number" },
            end_line: { type: "number" }
          },
          required: ["action"]
        }
      },
      {
        name: "git_diff",
        description: TOOL_METADATA.git_diff.description,
        annotations: TOOL_METADATA.git_diff.annotations,
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["working", "compare", "show", "range_diff"],
              description: "Tipo di diff: 'working' (unstaged/cached), 'compare' (tra branch), 'show' (dettagli commit)."
            },
            project_path: { type: "string" },
            roots: {
              type: "array",
              items: { type: "string" },
              description: "Fallback opzionale a project_path: lista roots passate dal client."
            },
            root_index: { type: "number", description: "Indice root da usare (default 0)." },
            target: { type: "string", description: "Branch base per compare." },
            source: { type: "string", description: "Branch/Commit sorgente. Default HEAD." },
            left_ref: { type: "string", description: "Ref sinistro esplicito per compare (precedenza su source)." },
            right_ref: { type: "string", description: "Ref destro esplicito per compare (precedenza su target)." },
            commit_hash: { type: "string" },
            file_path: { type: "string" },
            cached: { type: "boolean", description: "Per 'working': diff dello stage." },
            name_only: { type: "boolean" },
            diff_mode: {
              type: "string",
              enum: ["two_dot", "three_dot"],
              description: "Per compare: two_dot usa target..source, three_dot usa target...source (default)."
            },
            stat: { type: "boolean", description: "Per compare: aggiunge --stat." },
            original_range: {
              type: "string",
              description: "Per range_diff: range commit originale (es. origin/main..HEAD@{1}). Deve rappresentare la stessa serie logica del range riscritto."
            },
            rewritten_range: {
              type: "string",
              description: "Per range_diff: range commit riscritto (es. origin/main..HEAD). Se i due range non sono equivalenti, only_left/only_right possono essere corretti ma fuorvianti."
            }
          },
          required: ["action"]
        }
      },
      {
        name: "git_conflict_manager",
        description: TOOL_METADATA.git_conflict_manager.description,
        annotations: TOOL_METADATA.git_conflict_manager.annotations,
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "list_detailed", "analyze", "read", "resolve", "stage", "rebase_step", "restore"],
              description: "Azione: 'list', 'list_detailed', 'analyze', 'read', 'resolve', 'stage', 'rebase_step', 'restore'."
            },
            project_path: { type: "string" },
            roots: {
              type: "array",
              items: { type: "string" },
              description: "Fallback opzionale a project_path: lista roots passate dal client."
            },
            root_index: { type: "number", description: "Indice root da usare (default 0)." },
            file_path: { type: "string" },
            commit_hash: { type: "string" },
            resolved_content: { type: "string" },
            rebase_action: { type: "string", enum: ["continue", "abort", "skip"] }
          },
          required: ["action"]
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let projectPath = null;

  try {
    projectPath = resolveProjectPath(args);
    if (name === "git_query") {
      switch (args.action) {
        case "status":
          const statusOut = await runGit("status -s", projectPath);
          return makeSuccessResult({
            text: statusOut || "Clean.",
            structuredContent: { ok: true, tool: "git_query", action: "status", project_path: projectPath, output: statusOut || "Clean." }
          });

        case "history":
          if (args.commit_ref) {
            await ensureResolvableRef(args.commit_ref, projectPath, "commit_ref");
          }
          let limitFlag = args.max_count ? ` -n ${args.max_count}` : (!args.commit_range && !args.file_path && !args.search_text ? " -n 20" : "");
          const target = args.file_path ? ` -- "${args.file_path}"` : "";
          let searchParam = args.search_text ? ` --grep="${args.search_text.replace(/"/g, '\\"')}" -i` : "";
          if (args.search_code) searchParam += ` -G"${args.search_code.replace(/"/g, '\\"')}"`;
          const revRange = args.commit_range ? ` ${args.commit_range}` : (args.commit_ref ? ` ${args.commit_ref}` : "");
          const format = `--pretty=format:"%h|%an|%ad|%s" --date=short`;
          const histOut = await runGit(`log${limitFlag}${searchParam} ${format}${revRange}${target}`, projectPath);
          const commits = histOut.split('\n').filter(l => l.trim()).map(l => {
            const p = l.split('|'); return { hash: p[0], author: p[1], date: p[2], message: p.slice(3).join('|') };
          });
          return makeSuccessResult({
            text: commits,
            structuredContent: {
              ok: true,
              tool: "git_query",
              action: "history",
              project_path: projectPath,
              commit_ref: args.commit_ref || null,
              commit_range: args.commit_range || null,
              commits
            }
          });

        case "list_files":
          const rev = args.commit_ref || "HEAD";
          const filesOut = await runGit(`diff-tree --no-commit-id --name-only -r ${rev}`, projectPath);
          return makeSuccessResult({
            text: filesOut || "Nessun cambiamento rilevato.",
            structuredContent: { ok: true, tool: "git_query", action: "list_files", project_path: projectPath, commit_ref: rev, output: filesOut || "" }
          });

        case "commit_info":
          const infoRef = args.commit_ref || "HEAD";
          const infoOut = await runGit(`log -1 --format="%H^|^%h^|^%an^|^%ad^|^%s" --date=short ${infoRef}`, projectPath);
          const parts = infoOut.split('^|^');
          const commit = { hash: parts[0], short_hash: parts[1], author: parts[2], date: parts[3], message: parts.slice(4).join('^|^') };
          return makeSuccessResult({
            text: commit,
            structuredContent: { ok: true, tool: "git_query", action: "commit_info", project_path: projectPath, commit }
          });

        case "blame":
          if (!args.file_path) throw new Error("file_path obbligatorio per blame.");
          let r = args.start_line ? `-L ${args.start_line},${args.end_line || args.start_line + 20}` : "";
          const blameOut = await runGit(`blame ${r} -e -n -w -- "${args.file_path}"`, projectPath);
          return makeSuccessResult({
            text: blameOut,
            structuredContent: { ok: true, tool: "git_query", action: "blame", project_path: projectPath, file_path: args.file_path, output: blameOut }
          });

        case "check_ancestor":
          try {
            await execAsync(`git merge-base --is-ancestor ${args.ancestor_commit} ${args.descendant_commit}`, { cwd: projectPath });
            return makeSuccessResult({
              text: "true",
              structuredContent: { ok: true, tool: "git_query", action: "check_ancestor", project_path: projectPath, is_ancestor: true }
            });
          } catch (e) {
            if (e.code === 1) {
              return makeSuccessResult({
                text: "false",
                structuredContent: { ok: true, tool: "git_query", action: "check_ancestor", project_path: projectPath, is_ancestor: false }
              });
            }
            throw e;
          }
        case "repo_info":
          const repoInfo = await getRepoInfo(projectPath);
          return makeSuccessResult({
            text: repoInfo,
            structuredContent: { ok: true, tool: "git_query", action: "repo_info", project_path: projectPath, repo: repoInfo }
          });

        case "rebase_status":
          const rebaseStatus = await getRebaseStatus(projectPath);
          return makeSuccessResult({
            text: rebaseStatus,
            structuredContent: { ok: true, tool: "git_query", action: "rebase_status", project_path: projectPath, rebase_status: rebaseStatus }
          });

        default: throw new Error(`Azione non valida per git_query: ${args.action}`);
      }
    }

    if (name === "git_diff") {
      switch (args.action) {
        case "working":
          const flags = args.cached ? "--cached" : "";
          const workOut = await runGit(`diff ${flags}`, projectPath);
          return makeSuccessResult({
            text: workOut || "No diff.",
            structuredContent: { ok: true, tool: "git_diff", action: "working", project_path: projectPath, output: workOut || "" }
          });

        case "compare":
          const leftInput = args.left_ref || args.source || "HEAD";
          const rightInput = args.right_ref || args.target;
          if (!rightInput) throw new Error("target/right_ref obbligatorio per compare.");
          const leftRef = await ensureResolvableRef(leftInput, projectPath, "left_ref/source");
          const rightRef = await ensureResolvableRef(rightInput, projectPath, "right_ref/target");
          const diffMode = args.diff_mode === "two_dot" ? "two_dot" : "three_dot";
          const separator = diffMode === "two_dot" ? ".." : "...";
          const nameOnly = args.name_only ? "--name-only" : "";
          const statFlag = args.stat ? "--stat" : "";
          const compFilter = args.file_path ? ` -- "${args.file_path}"` : "";
          const compOut = await runGit(`diff ${nameOnly} ${statFlag} ${leftRef}${separator}${rightRef}${compFilter}`, projectPath);
          const nameStatusOut = await runGit(`diff --name-status ${leftRef}..${rightRef}${compFilter}`, projectPath);
          const rawFiles = parseNameStatus(nameStatusOut);
          const files = await Promise.all(rawFiles.map(async (entry) => {
            const candidatePath = entry.path || args.file_path;
            const existsInLeft = candidatePath ? await fileExistsInRef(leftRef, candidatePath, projectPath) : false;
            const existsInRight = candidatePath ? await fileExistsInRef(rightRef, candidatePath, projectPath) : false;
            return {
              path: candidatePath,
              exists_in_left: existsInLeft,
              exists_in_right: existsInRight,
              change_type: entry.change_type,
              raw_status: entry.raw_status
            };
          }));
          const hasDiff = Boolean(compOut && compOut.trim());
          return makeSuccessResult({
            text: compOut || "Nessuna differenza.",
            structuredContent: {
              ok: true,
              tool: "git_diff",
              action: "compare",
              project_path: projectPath,
              source: leftRef,
              target: rightRef,
              left_ref: leftRef,
              right_ref: rightRef,
              diff_direction: "left_to_right",
              diff_sides: {
                a_path_prefix: leftRef,
                b_path_prefix: rightRef
              },
              diff_mode: diffMode,
              stat: args.stat === true,
              has_diff: hasDiff,
              files,
              output: compOut || ""
            }
          });

        case "show":
          const hash = args.commit_hash || "HEAD";
          const showFilter = args.file_path ? ` -- "${args.file_path}"` : "";
          const showOut = await runGit(`show ${hash}${showFilter}`, projectPath);
          return makeSuccessResult({
            text: showOut,
            structuredContent: { ok: true, tool: "git_diff", action: "show", project_path: projectPath, commit_hash: hash, output: showOut }
          });

        case "range_diff":
          if (!args.original_range || !args.rewritten_range) {
            throw new Error("original_range e rewritten_range sono obbligatori per range_diff.");
          }
          const originalRange = String(args.original_range).trim();
          const rewrittenRange = String(args.rewritten_range).trim();
          const parsedOriginal = parseCommitRange(originalRange);
          const parsedRewritten = parseCommitRange(rewrittenRange);
          if (!parsedOriginal || !parsedRewritten) {
            throw new Error("Formato range non valido. Usa '<base>..<tip>' o '<base>...<tip>' per original_range e rewritten_range.");
          }

          let rangeDiffOut;
          try {
            rangeDiffOut = await runGit(
              `range-diff --no-color ${shellQuote(parsedOriginal.raw)} ${shellQuote(parsedRewritten.raw)}`,
              projectPath
            );
          } catch (error) {
            if (/need two commit ranges/i.test(error.message) && parsedOriginal.left === parsedRewritten.left) {
              rangeDiffOut = await runGit(
                `range-diff --no-color ${shellQuote(parsedOriginal.left)} ${shellQuote(parsedOriginal.right)} ${shellQuote(parsedRewritten.right)}`,
                projectPath
              );
            } else {
              throw error;
            }
          }

          const hasRangeDiff = Boolean(rangeDiffOut && rangeDiffOut.trim());
          const rangeSummary = parseRangeDiffOutput(rangeDiffOut);
          const semanticHint = buildRangeDiffHint(rangeSummary);
          return makeSuccessResult({
            text: rangeDiffOut || "Nessuna differenza tra le due serie di commit.",
            structuredContent: {
              ok: true,
              tool: "git_diff",
              action: "range_diff",
              project_path: projectPath,
              original_range: originalRange,
              rewritten_range: rewrittenRange,
              has_diff: hasRangeDiff,
              range_summary: rangeSummary,
              semantic_hint: semanticHint,
              output: rangeDiffOut || ""
            }
          });

        default: throw new Error(`Azione non valida per git_diff: ${args.action}`);
      }
    }

    if (name === "git_conflict_manager") {
      switch (args.action) {
        case "list":
          const confList = await runGit("diff --name-only --diff-filter=U", projectPath);
          return makeSuccessResult({
            text: confList ? "File in conflitto:\n" + confList : "Nessun conflitto.",
            structuredContent: { ok: true, tool: "git_conflict_manager", action: "list", project_path: projectPath, files: confList ? confList.split("\n").filter(Boolean) : [] }
          });

        case "list_detailed":
          const conflictsDetailed = await listConflictsDetailed(projectPath);
          return makeSuccessResult({
            text: conflictsDetailed,
            structuredContent: {
              ok: true,
              tool: "git_conflict_manager",
              action: "list_detailed",
              project_path: projectPath,
              conflict_count: conflictsDetailed.length,
              conflicts: conflictsDetailed
            }
          });

        case "analyze":
          if (!args.file_path) throw new Error("file_path obbligatorio per analyze.");
          return await analyzeConflict(projectPath, args.file_path);

        case "read":
          if (!args.file_path) throw new Error("file_path obbligatorio per read.");
          if (args.commit_hash) {
            const posixPath = args.file_path.replace(/\\/g, '/');
            const data = await runGit(`show ${args.commit_hash}:"${posixPath}"`, projectPath);
            return makeSuccessResult({
              text: data,
              structuredContent: { ok: true, tool: "git_conflict_manager", action: "read", project_path: projectPath, file_path: args.file_path, commit_hash: args.commit_hash, output: data }
            });
          } else {
            const content = fs.readFileSync(path.join(projectPath, args.file_path), 'utf8');
            return makeSuccessResult({
              text: content,
              structuredContent: { ok: true, tool: "git_conflict_manager", action: "read", project_path: projectPath, file_path: args.file_path, output: content }
            });
          }

        case "resolve":
          if (!args.file_path || args.resolved_content === undefined) throw new Error("file_path e resolved_content obbligatori.");
          fs.writeFileSync(path.join(projectPath, args.file_path), args.resolved_content, 'utf8');
          return makeSuccessResult({
            text: `✅ File salvato: ${args.file_path}`,
            structuredContent: { ok: true, tool: "git_conflict_manager", action: "resolve", project_path: projectPath, file_path: args.file_path, saved: true }
          });

        case "stage":
          if (!args.file_path) throw new Error("file_path obbligatorio per stage.");
          await runGit(`add "${args.file_path}"`, projectPath);
          return makeSuccessResult({
            text: `✅ File aggiunto allo stage: ${args.file_path}`,
            structuredContent: { ok: true, tool: "git_conflict_manager", action: "stage", project_path: projectPath, file_path: args.file_path, staged: true }
          });

        case "rebase_step":
          if (!args.rebase_action) throw new Error("rebase_action obbligatorio.");
          let cmd = `rebase --${args.rebase_action}`;
          const rbOut = await runGit(cmd, projectPath);
          return makeSuccessResult({
            text: rbOut || `Azione ${args.rebase_action} completata.`,
            structuredContent: { ok: true, tool: "git_conflict_manager", action: "rebase_step", project_path: projectPath, rebase_action: args.rebase_action, output: rbOut || "" }
          });

        case "restore":
          if (!args.file_path || !args.commit_hash) throw new Error("file_path e commit_hash obbligatori.");
          await runGit(`checkout ${args.commit_hash} -- "${args.file_path}"`, projectPath);
          return makeSuccessResult({
            text: `✅ File ripristinato: ${args.file_path}`,
            structuredContent: { ok: true, tool: "git_conflict_manager", action: "restore", project_path: projectPath, file_path: args.file_path, commit_hash: args.commit_hash, restored: true }
          });

        default: throw new Error(`Azione non valida per conflict_manager: ${args.action}`);
      }
    }

    throw new Error(`Tool sconosciuto: ${name}`);
  } catch (error) {
    return makeErrorResult(error, { tool: name, action: args?.action, project_path: projectPath });
  }
});

async function analyzeConflict(projectPath, filePath) {
  const fullPath = path.join(projectPath, filePath);
  if (!fs.existsSync(fullPath)) throw new Error("File non trovato");
  let content = fs.readFileSync(fullPath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const lines = content.split(/\r?\n/);
  const conflicts = [];
  let current = null;
  let block = null;
  lines.forEach((line, index) => {
    const num = index + 1;
    if (line.startsWith('<<<<<<<')) {
      current = { start_line: num, head_header: line, head_content: [], base_content: [], incoming_content: [], incoming_header: null, end_line: null };
      block = 'head';
    } else if (line.startsWith('|||||||')) { if (current) block = 'base'; }
    else if (line.startsWith('=======')) { if (current) block = 'incoming'; }
    else if (line.startsWith('>>>>>>>')) {
      if (current) {
        current.end_line = num; current.incoming_header = line;
        current.head_content = current.head_content.join('\n');
        current.base_content = current.base_content.join('\n');
        current.incoming_content = current.incoming_content.join('\n');
        conflicts.push(current); current = null; block = null;
      }
    } else if (current && block) {
      if (block === 'head') current.head_content.push(line);
      else if (block === 'base') current.base_content.push(line);
      else if (block === 'incoming') current.incoming_content.push(line);
    }
  });
  return makeSuccessResult({
    text: { file_path: filePath, conflict_count: conflicts.length, conflicts },
    structuredContent: {
      ok: true,
      tool: "git_conflict_manager",
      action: "analyze",
      project_path: projectPath,
      file_path: filePath,
      conflict_count: conflicts.length,
      conflicts
    }
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
