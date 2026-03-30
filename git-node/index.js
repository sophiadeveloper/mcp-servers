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
  "Usa sempre project_path per puntare alla root del repository target.",
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
              enum: ["status", "history", "list_files", "commit_info", "blame", "check_ancestor"],
              description: "L'operazione di lettura: 'status', 'history', 'list_files', 'commit_info', 'blame', 'check_ancestor'."
            },
            project_path: { type: "string" },
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
          required: ["action", "project_path"]
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
              enum: ["working", "compare", "show"],
              description: "Tipo di diff: 'working' (unstaged/cached), 'compare' (tra branch), 'show' (dettagli commit)."
            },
            project_path: { type: "string" },
            target: { type: "string", description: "Branch base per compare." },
            source: { type: "string", description: "Branch/Commit sorgente. Default HEAD." },
            commit_hash: { type: "string" },
            file_path: { type: "string" },
            cached: { type: "boolean", description: "Per 'working': diff dello stage." },
            name_only: { type: "boolean" }
          },
          required: ["action", "project_path"]
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
              enum: ["list", "analyze", "read", "resolve", "stage", "rebase_step", "restore"],
              description: "Azione: 'list', 'analyze', 'read', 'resolve', 'stage', 'rebase_step', 'restore'."
            },
            project_path: { type: "string" },
            file_path: { type: "string" },
            commit_hash: { type: "string" },
            resolved_content: { type: "string" },
            rebase_action: { type: "string", enum: ["continue", "abort", "skip"] }
          },
          required: ["action", "project_path"]
        }
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const projectPath = args.project_path;

  try {
    if (name === "git_query") {
      switch (args.action) {
        case "status":
          const statusOut = await runGit("status -s", projectPath);
          return makeSuccessResult({
            text: statusOut || "Clean.",
            structuredContent: { ok: true, tool: "git_query", action: "status", project_path: projectPath, output: statusOut || "Clean." }
          });

        case "history":
          let limitFlag = args.max_count ? ` -n ${args.max_count}` : (!args.commit_range && !args.file_path && !args.search_text ? " -n 20" : "");
          const target = args.file_path ? ` -- "${args.file_path}"` : "";
          let searchParam = args.search_text ? ` --grep="${args.search_text.replace(/"/g, '\\"')}" -i` : "";
          if (args.search_code) searchParam += ` -G"${args.search_code.replace(/"/g, '\\"')}"`;
          const revRange = args.commit_range ? ` ${args.commit_range}` : "";
          const format = `--pretty=format:"%h|%an|%ad|%s" --date=short`;
          const histOut = await runGit(`log${limitFlag}${searchParam} ${format}${revRange}${target}`, projectPath);
          const commits = histOut.split('\n').filter(l => l.trim()).map(l => {
            const p = l.split('|'); return { hash: p[0], author: p[1], date: p[2], message: p.slice(3).join('|') };
          });
          return makeSuccessResult({
            text: commits,
            structuredContent: { ok: true, tool: "git_query", action: "history", project_path: projectPath, commits }
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
          const src = args.source || "HEAD";
          const tgt = args.target;
          if (!tgt) throw new Error("target obbligatorio per compare.");
          const nameOnly = args.name_only ? "--name-only" : "";
          const compFilter = args.file_path ? ` -- "${args.file_path}"` : "";
          const compOut = await runGit(`diff ${nameOnly} ${tgt}...${src}${compFilter}`, projectPath);
          return makeSuccessResult({
            text: compOut || "Nessuna differenza.",
            structuredContent: { ok: true, tool: "git_diff", action: "compare", project_path: projectPath, source: src, target: tgt, output: compOut || "" }
          });

        case "show":
          const hash = args.commit_hash || "HEAD";
          const showFilter = args.file_path ? ` -- "${args.file_path}"` : "";
          const showOut = await runGit(`show ${hash}${showFilter}`, projectPath);
          return makeSuccessResult({
            text: showOut,
            structuredContent: { ok: true, tool: "git_diff", action: "show", project_path: projectPath, commit_hash: hash, output: showOut }
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
          if (fs.existsSync(path.join(projectPath, ".git", "MERGE_HEAD")) && args.rebase_action === "continue") {
            cmd = "commit --no-edit";
          }
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
