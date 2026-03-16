#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";

const execAsync = util.promisify(exec);

const server = new Server(
  { name: "git-node-manager", version: "3.2.0" },
  { capabilities: { tools: {} } }
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
        description: "Esplora lo stato e la storia del repository Git (Sola Lettura).",
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
        description: "Visualizza le differenze tra stati del repository.",
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
        description: "Gestisce il ciclo di vita dei conflitti di merge e operazioni di scrittura.",
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
          return { content: [{ type: "text", text: statusOut || "Clean." }] };

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
          return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };

        case "list_files":
          const rev = args.commit_ref || "HEAD";
          const filesOut = await runGit(`diff-tree --no-commit-id --name-only -r ${rev}`, projectPath);
          return { content: [{ type: "text", text: filesOut || "Nessun cambiamento rilevato." }] };

        case "commit_info":
          const infoRef = args.commit_ref || "HEAD";
          const infoOut = await runGit(`log -1 --format="%H^|^%h^|^%an^|^%ad^|^%s" --date=short ${infoRef}`, projectPath);
          const parts = infoOut.split('^|^');
          return { content: [{ type: "text", text: JSON.stringify({ hash: parts[0], short_hash: parts[1], author: parts[2], date: parts[3], message: parts.slice(4).join('^|^') }, null, 2) }] };

        case "blame":
          if (!args.file_path) throw new Error("file_path obbligatorio per blame.");
          let r = args.start_line ? `-L ${args.start_line},${args.end_line || args.start_line + 20}` : "";
          const blameOut = await runGit(`blame ${r} -e -n -w -- "${args.file_path}"`, projectPath);
          return { content: [{ type: "text", text: blameOut }] };

        case "check_ancestor":
          try {
            await execAsync(`git merge-base --is-ancestor ${args.ancestor_commit} ${args.descendant_commit}`, { cwd: projectPath });
            return { content: [{ type: "text", text: "true" }] };
          } catch (e) {
            if (e.code === 1) return { content: [{ type: "text", text: "false" }] };
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
          return { content: [{ type: "text", text: workOut || "No diff." }] };

        case "compare":
          const src = args.source || "HEAD";
          const tgt = args.target;
          if (!tgt) throw new Error("target obbligatorio per compare.");
          const nameOnly = args.name_only ? "--name-only" : "";
          const compFilter = args.file_path ? ` -- "${args.file_path}"` : "";
          const compOut = await runGit(`diff ${nameOnly} ${tgt}...${src}${compFilter}`, projectPath);
          return { content: [{ type: "text", text: compOut || `Nessuna differenza.` }] };

        case "show":
          const hash = args.commit_hash || "HEAD";
          const showFilter = args.file_path ? ` -- "${args.file_path}"` : "";
          const showOut = await runGit(`show ${hash}${showFilter}`, projectPath);
          return { content: [{ type: "text", text: showOut }] };

        default: throw new Error(`Azione non valida per git_diff: ${args.action}`);
      }
    }

    if (name === "git_conflict_manager") {
      switch (args.action) {
        case "list":
          const confList = await runGit("diff --name-only --diff-filter=U", projectPath);
          return { content: [{ type: "text", text: confList ? "File in conflitto:\n" + confList : "Nessun conflitto." }] };

        case "analyze":
          if (!args.file_path) throw new Error("file_path obbligatorio per analyze.");
          return await analyzeConflict(projectPath, args.file_path);

        case "read":
          if (!args.file_path) throw new Error("file_path obbligatorio per read.");
          if (args.commit_hash) {
            const posixPath = args.file_path.replace(/\\/g, '/');
            const data = await runGit(`show ${args.commit_hash}:"${posixPath}"`, projectPath);
            return { content: [{ type: "text", text: data }] };
          } else {
            const content = fs.readFileSync(path.join(projectPath, args.file_path), 'utf8');
            return { content: [{ type: "text", text: content }] };
          }

        case "resolve":
          if (!args.file_path || args.resolved_content === undefined) throw new Error("file_path e resolved_content obbligatori.");
          fs.writeFileSync(path.join(projectPath, args.file_path), args.resolved_content, 'utf8');
          return { content: [{ type: "text", text: `✅ File salvato: ${args.file_path}` }] };

        case "stage":
          if (!args.file_path) throw new Error("file_path obbligatorio per stage.");
          await runGit(`add "${args.file_path}"`, projectPath);
          return { content: [{ type: "text", text: `✅ File aggiunto allo stage: ${args.file_path}` }] };

        case "rebase_step":
          if (!args.rebase_action) throw new Error("rebase_action obbligatorio.");
          let cmd = `rebase --${args.rebase_action}`;
          if (fs.existsSync(path.join(projectPath, ".git", "MERGE_HEAD")) && args.rebase_action === "continue") {
            cmd = "commit --no-edit";
          }
          const rbOut = await runGit(cmd, projectPath);
          return { content: [{ type: "text", text: rbOut || `Azione ${args.rebase_action} completata.` }] };

        case "restore":
          if (!args.file_path || !args.commit_hash) throw new Error("file_path e commit_hash obbligatori.");
          await runGit(`checkout ${args.commit_hash} -- "${args.file_path}"`, projectPath);
          return { content: [{ type: "text", text: `✅ File ripristinato: ${args.file_path}` }] };

        default: throw new Error(`Azione non valida per conflict_manager: ${args.action}`);
      }
    }

    throw new Error(`Tool sconosciuto: ${name}`);
  } catch (error) {
    return { content: [{ type: "text", text: `❌ Errore: ${error.message}` }], isError: true };
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
  return { content: [{ type: "text", text: JSON.stringify({ file_path: filePath, conflict_count: conflicts.length, conflicts: conflicts }, null, 2) }] };
}

const transport = new StdioServerTransport();
await server.connect(transport);