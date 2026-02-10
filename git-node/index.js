#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import util from "util";
import fs from "fs";

const execAsync = util.promisify(exec);

const server = new Server(
  { name: "git-node-manager", version: "2.3.0" },
  { capabilities: { tools: {} } }
);

/**
 * Esegue un comando git nella cartella del progetto
 * Gestisce maxBuffer per output grandi
 */
async function runGit(command, projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) {
    throw new Error(`Path del progetto non valido: ${projectPath}`);
  }

  try {
    const { stdout, stderr } = await execAsync(`git ${command}`, {
      cwd: projectPath,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });

    if (stderr && !stdout) {
      console.error(`Git Potential Error: ${stderr}`);
    }
    return stdout ? stdout.trim() : "";
  } catch (error) {
    throw new Error(`Git Error: ${error.message}`);
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "git_status",
        description: "Mostra i file modificati, nuovi o cancellati nel workspace corrente.",
        inputSchema: {
          type: "object",
          properties: { project_path: { type: "string" } },
          required: ["project_path"],
        },
      },
      {
        name: "git_diff_working",
        description: "Mostra le differenze NON ancora committate (il lavoro attuale).",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            cached: { type: "boolean", description: "Se true, mostra le differenze in stage." }
          },
          required: ["project_path"],
        },
      },
      {
        name: "git_show_commit",
        description: "Mostra i dettagli e il DIFF completo di un commit PASSATO specifico.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            commit_hash: { type: "string", description: "Hash del commit da analizzare" }
          },
          required: ["project_path", "commit_hash"],
        },
      },
      {
        name: "git_history",
        description: "Cerca nella cronologia dei commit. Filtra per file o cerca testo nel messaggio.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            max_count: { type: "number", description: "Numero max di risultati. Default: 20 (se nessun filtro), Illimitato (se filtrato)." },
            file_path: { type: "string", description: "Opzionale: filtra per file specifico." },
            search_text: { type: "string", description: "Opzionale: Cerca testo nel messaggio di commit (grep)." }
          },
          required: ["project_path"],
        },
      },
      {
        name: "git_blame",
        description: "Mostra chi ha modificato cosa riga per riga.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            file_path: { type: "string" },
            start_line: { type: "number" },
            end_line: { type: "number" }
          },
          required: ["project_path", "file_path"],
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
      return { content: [{ type: "text", text: output || "Nessuna modifica pendente." }] };
    }

    // 2. DIFF WORKSPACE
    if (name === "git_diff_working") {
      const flags = args.cached ? "--cached" : "";
      const output = await runGit(`diff ${flags}`, projectPath);
      return { content: [{ type: "text", text: output || "Nessuna differenza trovata." }] };
    }

    // 3. SHOW COMMIT
    if (name === "git_show_commit") {
      const output = await runGit(`show ${args.commit_hash}`, projectPath);
      return { content: [{ type: "text", text: output }] };
    }

    // 4. HISTORY (Log + Search Smart)
    if (name === "git_history") {

      // LOGICA LIMITI INTELLIGENTE:
      // - Se l'utente specifica max_count -> Usa quello.
      // - Se l'utente filtra (file o search) -> Nessun limite (mostra tutti i match).
      // - Se l'utente NON filtra e NON specifica max -> Default 20 (per non intasare).

      let limitFlag = "";
      if (args.max_count) {
        limitFlag = ` -n ${args.max_count}`;
      } else if (!args.file_path && !args.search_text) {
        limitFlag = " -n 20";
      }
      // Else: limitFlag resta vuoto (illimitato) perché ci sono filtri

      const target = args.file_path ? ` -- "${args.file_path}"` : "";

      let searchParam = "";
      if (args.search_text) {
        const safeSearch = args.search_text.replace(/"/g, '\\"');
        searchParam = ` --grep="${safeSearch}" -i`;
      }

      const format = `--pretty=format:"%h|%an|%ad|%s" --date=short`;

      // Comando finale es: git log -n 20 --grep="fix" ...
      const rawOutput = await runGit(`log${limitFlag}${searchParam} ${format}${target}`, projectPath);

      const commits = rawOutput.split('\n').filter(line => line.trim() !== '').map(line => {
        const parts = line.split('|');
        return { hash: parts[0], author: parts[1], date: parts[2], message: parts.slice(3).join('|') };
      });

      if (commits.length === 0) {
        return { content: [{ type: "text", text: "Nessun commit trovato con questi criteri." }] };
      }

      return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };
    }

    // 5. BLAME
    if (name === "git_blame") {
      let rangeParam = "";
      if (args.start_line) {
        const end = args.end_line || args.start_line + 20;
        rangeParam = `-L ${args.start_line},${end}`;
      }
      const output = await runGit(`blame ${rangeParam} -e -n -w -- "${args.file_path}"`, projectPath);
      return { content: [{ type: "text", text: output }] };
    }

    throw new Error(`Tool sconosciuto: ${name}`);

  } catch (error) {
    return {
      content: [{ type: "text", text: `❌ Git Error: ${error.message}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);