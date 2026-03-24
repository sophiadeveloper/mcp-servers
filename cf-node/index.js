#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// --- CONFIGURAZIONE ---
const SERVER_NAME = "coldfusion-bridge";
const VERSION = "2.0.0";
const DEFAULT_TOKEN = "Secret_CF_MCP_2026"; // Lo stesso definito nel tuo mcp_agent.cfm
const DEFAULT_CF_URL = "http://localhost:8500/mcp_agent.cfm"; // Fallback se non c'è .env

const server = new Server(
  { name: SERVER_NAME, version: VERSION },
  { capabilities: { tools: {} } }
);

/**
 * Cerca l'URL del Bridge nello specifico progetto su cui l'utente sta lavorando.
 * Legge il file .env nella cartella indicata da 'project_path'.
 */
function getTargetConfig(projectPath) {
  let config = {
    url: DEFAULT_CF_URL,
    token: DEFAULT_TOKEN
  };

  if (projectPath) {
    const envPath = path.join(projectPath, '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envConfig = dotenv.parse(fs.readFileSync(envPath));
        if (envConfig.CF_BRIDGE_URL) config.url = envConfig.CF_BRIDGE_URL;
        if (envConfig.CF_MCP_TOKEN) config.token = envConfig.CF_MCP_TOKEN;
      } catch (e) {
        console.error("Errore lettura .env locale:", e);
      }
    }
  }
  return config;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "cf_bridge",
        description: "Tool unificato per interagire con il server ColdFusion: esecuzione codice e gestione log.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["evaluate", "logs_list", "logs_read"],
              description: "L'operazione da eseguire: 'evaluate' per codice CFML, 'logs_list' per cercare i log, 'logs_read' per leggere un log."
            },
            expression: { type: "string", description: "Codice/Espressione CFML (necessario per 'evaluate')." },
            searchString: { type: "string", description: "Filtro nome file log (opzionale per 'logs_list')." },
            logName: { type: "string", description: "Nome file o path assoluto log (necessario per 'logs_read')." },
            lines: { type: "number", description: "Numero righe da leggere (opzionale per 'logs_read', default 50)." },
            customPath: { type: "string", description: "Path cartella log personalizzato (opzionale per 'logs_list')." },
            project_path: { type: "string", description: "Percorso root del progetto." }
          },
          required: ["action", "project_path"],
        },
      }
    ],
  };
});

// --- ESECUZIONE TOOL ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "cf_bridge") {
    throw new Error(`Tool sconosciuto: ${name}`);
  }

  // 1. Determina URL e Token in base al progetto
  const cfConfig = getTargetConfig(args.project_path);

  // 2. Prepara il payload base
  let payload = {
    token: cfConfig.token,
    action: ""
  };

  // 3. Mappa l'azione dell'MCP sulle Action del backend CFM
  try {
    switch (args.action) {
      case "evaluate":
        if (!args.expression) throw new Error("Expression mancante per action 'evaluate'");
        payload.action = "evaluate_code";
        payload.expression = args.expression;
        break;

      case "logs_list":
        payload.action = "list_log_files";
        if (args.searchString) payload.searchString = args.searchString;
        if (args.customPath) payload.customPath = args.customPath;
        break;

      case "logs_read":
        if (!args.logName) throw new Error("logName mancante per action 'logs_read'");
        payload.action = "read_log";
        payload.logName = args.logName;
        payload.lines = args.lines || 50;
        break;

      default:
        throw new Error(`Azione sconosciuta: ${args.action}`);
    }

    // 4. Esegui richiesta HTTP al Bridge
    const response = await axios.post(cfConfig.url, payload, { timeout: 10000 });
    const data = response.data;

    // 5. Gestione Errori Applicativi (dal CFM)
    if (data.status === "error") {
      return {
        content: [{ type: "text", text: `❌ Errore ColdFusion:\nMsg: ${data.message}\nDettaglio: ${data.detail || 'N/A'}` }],
        isError: true
      };
    }

    // 6. Successo
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };

  } catch (error) {
    // Gestione Errori di Rete / Axios
    const errorDetails = error.response
      ? `Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`
      : error.message;

    return {
      content: [{
        type: "text",
        text: `🔥 Errore Comunicazione Bridge (${cfConfig.url}):\n${errorDetails}\n\nVerifica che il server sia acceso e il file .env abbia l'URL corretto.`
      }],
      isError: true
    };
  }
});

// Avvio Server
const transport = new StdioServerTransport();
await server.connect(transport);
