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

// --- DEFINIZIONE TOOL ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "cf_evaluate",
        description: "Esegue codice CFML arbitrario nel contesto dell'applicazione corrente via Bridge.",
        inputSchema: {
          type: "object",
          properties: {
            expression: { type: "string", description: "Codice/Espressione CFML da valutare (es. 'application.name' o 'server.coldfusion.productversion')." },
            project_path: { type: "string", description: "Percorso root del progetto (per trovare il bridge corretto)." }
          },
          required: ["expression", "project_path"],
        },
      },
      {
        name: "cf_list_logs",
        description: "Cerca i file di log sul server ColdFusion. Supporta wildcard e path personalizzati.",
        inputSchema: {
          type: "object",
          properties: {
            searchString: { type: "string", description: "Filtro nome file (es. 'exception' trova anche 'exception.1.log'). Vuoto = tutti." },
            customPath: { type: "string", description: "Path assoluto cartella log opzionale (es. 'D:\\Logs'). Se vuoto usa default CF." },
            project_path: { type: "string" }
          },
          required: ["project_path"],
        },
      },
      {
        name: "cf_read_log",
        description: "Legge e parsa un file di log, restituendo dati strutturati (timestamp, severity, message).",
        inputSchema: {
          type: "object",
          properties: {
            logName: { type: "string", description: "Nome file (es. 'exception.log') o Path Assoluto completo." },
            lines: { type: "number", description: "Numero righe da leggere (default 50)." },
            project_path: { type: "string" }
          },
          required: ["logName", "project_path"],
        },
      },
      {
        name: "cf_get_datasources",
        description: "Elenca i Datasource (DB) configurati nel server ColdFusion.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" }
          },
          required: ["project_path"],
        },
      }
    ],
  };
});

// --- ESECUZIONE TOOL ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // 1. Determina URL e Token in base al progetto
  const cfConfig = getTargetConfig(args.project_path);

  // 2. Prepara il payload base
  let payload = {
    token: cfConfig.token,
    action: ""
  };

  // 3. Mappa i Tool sulle Action del backend CFM
  try {
    switch (name) {
      case "cf_evaluate":
        payload.action = "evaluate_code";
        payload.expression = args.expression;
        break;

      case "cf_list_logs":
        payload.action = "list_log_files";
        if (args.searchString) payload.searchString = args.searchString;
        if (args.customPath) payload.customPath = args.customPath;
        break;

      case "cf_read_log":
        payload.action = "read_log";
        payload.logName = args.logName;
        payload.lines = args.lines || 50;
        break;

      case "cf_get_datasources":
        payload.action = "get_datasources";
        break;

      default:
        throw new Error(`Tool sconosciuto: ${name}`);
    }

    // 4. Esegui richiesta HTTP al Bridge
    // Timeout breve (10s) per non bloccare l'AI
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