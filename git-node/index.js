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
  { name: "git-node-manager", version: "3.1.0" },
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
    // Ignoriamo stderr non bloccanti (es. switch branch info)
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
      // --- TOOL DI LETTURA/ANALISI ---
      {
        name: "git_status",
        description: "Status del workspace.",
        inputSchema: {
          type: "object", properties: { project_path: { type: "string" } }, required: ["project_path"]
        },
      },
      {
        name: "git_diff_working",
        description: "Diff del lavoro attuale (Unstaged). Utile per verificare le correzioni prima di fare Add.",
        inputSchema: {
          type: "object", properties: { project_path: { type: "string" }, cached: { type: "boolean" } }, required: ["project_path"]
        },
      },
      {
        name: "git_show_commit",
        description: "Dettagli di un commit passato.",
        inputSchema: {
          type: "object", properties: { project_path: { type: "string" }, commit_hash: { type: "string" } }, required: ["project_path", "commit_hash"]
        },
      },
      {
        name: "git_history",
        description: "Log dei commit filtrabile.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            max_count: { type: "number" },
            file_path: { type: "string" },
            search_text: { type: "string" }
          },
          required: ["project_path"]
        },
      },
      {
        name: "git_blame",
        description: "Authorship riga per riga.",
        inputSchema: {
          type: "object", properties: { project_path: { type: "string" }, file_path: { type: "string" }, start_line: { type: "number" }, end_line: { type: "number" } }, required: ["project_path", "file_path"]
        },
      },


      // --- TOOL DI LETTURA/ANALISI ---
      {
        name: "git_diff_compare",
        description: "Compara due branch (o commit) usando 'git diff target...source' (triple dot). Ideale per Code Review di feature branch rispetto a dev/main.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            source: { type: "string", description: "Il branch/commit con le novità (es. feature-branch). Default: HEAD" },
            target: { type: "string", description: "Il branch/commit base (es. develops/main)." },
            name_only: { type: "boolean", description: "Se true, elenca solo i nomi dei file cambiati." },
            file_path: { type: "string", description: "Opzionale: limita il diff a un file specifico." }
          },
          required: ["project_path", "target"]
        },
      },

      // --- TOOL GESTIONE CONFLITTI ---
      {
        name: "git_list_conflicts",
        description: "Elenca i file in stato 'Unmerged' (conflitto).",
        inputSchema: {
          type: "object",
          properties: { project_path: { type: "string" } },
          required: ["project_path"],
        },
      },
      {
        name: "git_read_file",
        description: "Legge il contenuto RAW di un file (per vedere i marcatori <<<<<<<).",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            file_path: { type: "string" }
          },
          required: ["project_path", "file_path"],
        },
      },
      {
        name: "git_resolve_file",
        description: "Sovrascrive un file con il contenuto risolto. NON esegue git add (devi farlo dopo).",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            file_path: { type: "string" },
            resolved_content: { type: "string", description: "Il codice finale pulito." }
          },
          required: ["project_path", "file_path", "resolved_content"],
        },
      },
      {
        name: "git_add",
        description: "Esegue 'git add' su un file. Da usare DOPO aver risolto il conflitto e verificato.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            file_path: { type: "string", description: "Il file da aggiungere allo stage." }
          },
          required: ["project_path", "file_path"],
        },
      },
      {
        name: "git_rebase_action",
        description: "Esegue azioni di rebase/merge: continue, abort o skip.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            action: { type: "string", enum: ["continue", "abort", "skip"] }
          },
          required: ["project_path", "action"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const projectPath = args.project_path || args.repo_path;

  try {
    // 1. STATUS
    if (name === "git_status") {
      const output = await runGit("status -s", projectPath);
      return { content: [{ type: "text", text: output || "Clean." }] };
    }
    // 2. DIFF
    if (name === "git_diff_working") {
      const flags = args.cached ? "--cached" : "";
      const output = await runGit(`diff ${flags}`, projectPath);
      return { content: [{ type: "text", text: output || "No diff." }] };
    }
    // 3. SHOW
    if (name === "git_show_commit") {
      const output = await runGit(`show ${args.commit_hash}`, projectPath);
      return { content: [{ type: "text", text: output }] };
    }
    // 4. HISTORY
    if (name === "git_history") {
      let limitFlag = args.max_count ? ` -n ${args.max_count}` : (!args.file_path && !args.search_text ? " -n 20" : "");
      const target = args.file_path ? ` -- "${args.file_path}"` : "";
      let searchParam = args.search_text ? ` --grep="${args.search_text.replace(/"/g, '\\"')}" -i` : "";
      const format = `--pretty=format:"%h|%an|%ad|%s" --date=short`;
      const rawOutput = await runGit(`log${limitFlag}${searchParam} ${format}${target}`, projectPath);
      const commits = rawOutput.split('\n').filter(l => l.trim()).map(l => {
        const p = l.split('|'); return { hash: p[0], author: p[1], date: p[2], message: p.slice(3).join('|') };
      });
      return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };
    }
    // 5. BLAME
    if (name === "git_blame") {
      let r = args.start_line ? `-L ${args.start_line},${args.end_line || args.start_line + 20}` : "";
      const output = await runGit(`blame ${r} -e -n -w -- "${args.file_path}"`, projectPath);
      return { content: [{ type: "text", text: output }] };
    }


    // 5b. DIFF COMPARE (SMART REVIEW)
    if (name === "git_diff_compare") {
      const source = args.source || "HEAD";
      const target = args.target;
      const nameOnly = args.name_only ? "--name-only" : "";
      const fileFilter = args.file_path ? ` -- "${args.file_path}"` : "";

      // Usa triple dot (...) per vedere i cambiamenti dal common ancestor
      // E' lo standard per le Code Review (es. GitHub PR)
      const output = await runGit(`diff ${nameOnly} ${target}...${source}${fileFilter}`, projectPath);

      return {
        content: [{
          type: "text",
          text: output || `Nessuna differenza trovata tra ${target} e ${source}.`
        }]
      };
    }

    // --- NUOVI TOOL CONFLITTI (SEPARATI) ---

    // 6. LIST CONFLICTS
    if (name === "git_list_conflicts") {
      const output = await runGit("diff --name-only --diff-filter=U", projectPath);
      if (!output) return { content: [{ type: "text", text: "Nessun conflitto rilevato (Working tree clean from Unmerged)." }] };
      return { content: [{ type: "text", text: "File in conflitto:\n" + output }] };
    }

    // 7. READ FILE
    if (name === "git_read_file") {
      const fullPath = path.join(projectPath, args.file_path);
      if (!fs.existsSync(fullPath)) throw new Error("File non trovato");
      const content = fs.readFileSync(fullPath, 'utf8');
      return { content: [{ type: "text", text: content }] };
    }

    // 8. RESOLVE (WRITE ONLY)
    if (name === "git_resolve_file") {
      const fullPath = path.join(projectPath, args.file_path);
      fs.writeFileSync(fullPath, args.resolved_content, 'utf8');
      return { content: [{ type: "text", text: `✅ File salvato: ${args.file_path}\nOra verifica con git_diff_working e poi usa git_add.` }] };
    }

    // 9. ADD (STAGE)
    if (name === "git_add") {
      await runGit(`add "${args.file_path}"`, projectPath);
      return { content: [{ type: "text", text: `✅ File aggiunto allo stage: ${args.file_path}` }] };
    }

    // 10. CONTINUE/ABORT
    if (name === "git_rebase_action") {
      let cmd = `rebase --${args.action}`;
      if (fs.existsSync(path.join(projectPath, ".git", "MERGE_HEAD")) && args.action === "continue") {
        cmd = "commit --no-edit";
      }
      const output = await runGit(cmd, projectPath);
      return { content: [{ type: "text", text: output || `Azione ${args.action} completata.` }] };
    }

    throw new Error(`Tool sconosciuto: ${name}`);
  } catch (error) {
    return { content: [{ type: "text", text: `❌ Errore: ${error.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);