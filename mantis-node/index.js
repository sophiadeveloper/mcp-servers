#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const server = new Server(
  { name: "mantis-node-tracker", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

/**
 * Alcune istanze Mantis (versioni datate o con plugin mal configurati) emettono
 * notice/warning PHP PRIMA del corpo JSON, corrompendo la risposta.
 * Questa funzione isola il JSON cercando il primo '{' o '[' nel body grezzo,
 * poi lancia un errore HTTP semantico se lo status è >= 400.
 */
function parseResponse(status, rawText) {
  // Trova il primo carattere JSON valido nel body
  const jsonStart = rawText.search(/[\[{]/);
  const cleanText = jsonStart >= 0 ? rawText.slice(jsonStart) : rawText;

  let data;
  try {
    data = JSON.parse(cleanText);
  } catch {
    // Se anche dopo la pulizia il JSON non è valido, rimuovi i tag HTML e lancia
    const plainText = rawText.replace(/<[^>]+>/g, '').trim();
    throw new Error(`HTTP ${status} — Risposta non parsificabile: ${plainText.slice(0, 300)}`);
  }

  if (status >= 400) {
    const apiMsg = data.message || data.error || JSON.stringify(data);
    const err = new Error(`HTTP ${status}: ${apiMsg}`);
    err.status = status;
    err.data = data;
    throw err;
  }

  return data;
}

function getMantisConfig(projectPath) {
  if (!projectPath) throw new Error("Percorso progetto mancante.");

  const envPath = path.join(projectPath, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`File .env non trovato in: ${projectPath}`);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath));

  const url = envConfig.MANTIS_URL;
  const token = envConfig.MANTIS_TOKEN;

  if (!url || !token) {
    throw new Error("Mancano MANTIS_URL o MANTIS_TOKEN nel file .env");
  }

  const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  return {
    baseURL: `${cleanUrl}/api/rest`,
    headers: {
      "Authorization": token,
      "Content-Type": "application/json"
    }
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "mantis_get_my_info",
        description: "Verifica la connessione a Mantis e ottiene info sull'utente.",
        inputSchema: {
          type: "object",
          properties: { project_path: { type: "string" } },
          required: ["project_path"],
        },
      },
      {
        name: "mantis_get_issue",
        description: "Ottiene i dettagli completi di un Bug/Issue dato il suo ID.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            issue_id: { type: "number", description: "L'ID numerico del ticket (spesso trovato nei commit Git)." }
          },
          required: ["project_path", "issue_id"],
        },
      },
      {
        name: "mantis_add_note",
        description: "Aggiunge un commento (Nota) a un ticket esistente.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            issue_id: { type: "number" },
            text: { type: "string", description: "Il testo del commento." }
          },
          required: ["project_path", "issue_id", "text"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const config = getMantisConfig(args.project_path);
    const client = axios.create({
      baseURL: config.baseURL,
      headers: config.headers,
      timeout: 10000,
      // Riceviamo sempre il body come testo grezzo così possiamo pulirlo
      // prima di parsare: gestisce i PHP notice/warning prepended al JSON.
      responseType: 'text',
      // Non lanciare eccezioni automatiche: gestiamo noi lo status HTTP.
      validateStatus: () => true
    });

    // 1. INFO UTENTE
    if (name === "mantis_get_my_info") {
      const res = await client.get('/users/me');
      const data = parseResponse(res.status, res.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    // 2. DETTAGLIO BUG
    if (name === "mantis_get_issue") {
      const res = await client.get(`/issues/${args.issue_id}`);
      const data = parseResponse(res.status, res.data);

      // Estraiamo il primo elemento se è un array (comportamento standard API Mantis per ID singolo)
      const rawIssue = data.issues ? data.issues[0] : data;

      // Formattiamo le note per renderle leggibili all'AI
      const formattedNotes = rawIssue.notes
        ? rawIssue.notes.map(n => `[${n.reporter.name} @ ${n.created_at}]: ${n.text}`).join("\n---\n")
        : "Nessuna nota.";

      // Creiamo un oggetto pulito per risparmiare token e focus
      const cleanIssue = {
        id: rawIssue.id,
        summary: rawIssue.summary,
        description: rawIssue.description,
        status: rawIssue.status.name,
        project: rawIssue.project.name,
        category: rawIssue.category ? rawIssue.category.name : "N/A",
        handler: rawIssue.handler ? rawIssue.handler.name : "Unassigned",
        updated_at: rawIssue.updated_at,
        notes_history: formattedNotes
      };

      return { content: [{ type: "text", text: JSON.stringify(cleanIssue, null, 2) }] };
    }

    // 3. AGGIUNGI NOTA
    if (name === "mantis_add_note") {
      const res = await client.post(`/issues/${args.issue_id}/notes`, {
        text: args.text,
        view_state: { name: "public" }
      });
      // parseResponse valida lo status (lancia se >= 400) e scarta il noise PHP
      parseResponse(res.status, res.data || '{}');
      return { content: [{ type: "text", text: `✅ Nota aggiunta con successo al ticket ${args.issue_id}` }] };
    }

    throw new Error(`Tool sconosciuto: ${name}`);

  } catch (error) {
    // error.status è impostato da parseResponse per gli errori HTTP semantici
    const errorMsg = error.status
      ? `API Error (${error.status}): ${JSON.stringify(error.data)}`
      : error.message;

    return {
      content: [{ type: "text", text: `❌ Mantis Error: ${errorMsg}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);