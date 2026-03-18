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
  const projectIdStr = envConfig.MANTIS_PROJECT_ID || "";

  if (!url || !token) {
    throw new Error("Mancano MANTIS_URL o MANTIS_TOKEN nel file .env");
  }

  const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;

  return {
    baseURL: `${cleanUrl}/api/rest`,
    headers: {
      "Authorization": token,
      "Content-Type": "application/json"
    },
    projectIds: projectIdStr ? projectIdStr.split(';') : []
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
        name: "mantis_issue_reader",
        description: "Legge o ricerca ticket su Mantis. Permette di ottenere un singolo ID o cercare una lista filtrata.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            action: { type: "string", enum: ["get_one", "search"], description: "Ottieni dettaglio singolo o cerca lista." },
            issue_id: { type: "number", description: "Necessario per 'get_one'." },
            query: { type: "string", description: "Testo di ricerca per 'search'." },
            status: { type: "string", description: "Filtra per stato (es. 'resolved', 'open')." },
            limit: { type: "number", description: "Max risultati (default 10)." }
          },
          required: ["project_path", "action"],
        },
      },
      {
        name: "mantis_add_note",
        description: "Aggiunge una nota PRIVATA a un ticket esistente.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            issue_id: { type: "number" },
            text: { type: "string", description: "Il testo della nota." }
          },
          required: ["project_path", "issue_id", "text"],
        },
      },
      {
        name: "mantis_files",
        description: "Gestisce gli allegati del ticket: upload (base64) o download.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            action: { type: "string", enum: ["upload", "download"], description: "Azione: carica o leggi file." },
            issue_id: { type: "number", description: "ID del ticket." },
            file_id: { type: "number", description: "ID del file (necessario per 'download')." },
            filename: { type: "string", description: "Nome file (necessario per 'upload')." },
            content: { type: "string", description: "Contenuto in Base64 (necessario per 'upload')." },
            save_path: { type: "string", description: "Percorso locale dove salvare il file scaricato (opzionale per 'download')." }
          },
          required: ["project_path", "action", "issue_id"],
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
      responseType: 'text',
      validateStatus: () => true
    });

    // 1. INFO UTENTE
    if (name === "mantis_get_my_info") {
      const res = await client.get('/users/me');
      const data = parseResponse(res.status, res.data);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    // 2. ISSUE READER (GET / SEARCH)
    if (name === "mantis_issue_reader") {
      if (args.action === "get_one") {
        if (!args.issue_id) throw new Error("Parametro issue_id mancante per action 'get_one'.");
        const res = await client.get(`/issues/${args.issue_id}`);
        const data = parseResponse(res.status, res.data);
        const rawIssue = data.issues ? data.issues[0] : data;

        const formattedNotes = rawIssue.notes
          ? rawIssue.notes.map(n => {
              let noteText = `[${n.view_state.name}] ${n.reporter.name} @ ${n.created_at}: ${n.text}`;
              if (n.attachments && n.attachments.length > 0) {
                const attList = n.attachments.map(a => `ID: ${a.id} (${a.filename})`).join(", ");
                noteText += `\n[Allegati nota: ${attList}]`;
              }
              return noteText;
            }).join("\n---\n")
          : "Nessuna nota.";

        const formattedFiles = rawIssue.attachments
          ? rawIssue.attachments.map(a => `ID: ${a.id} | ${a.filename} | ${a.size} bytes`).join("\n")
          : "Nessun allegato.";

        const cleanIssue = {
          id: rawIssue.id,
          summary: rawIssue.summary,
          description: rawIssue.description,
          status: rawIssue.status.label || rawIssue.status.name,
          project: rawIssue.project.name,
          category: rawIssue.category ? rawIssue.category.name : "N/A",
          handler: rawIssue.handler ? rawIssue.handler.real_name : "Unassigned",
          created_at: rawIssue.created_at,
          updated_at: rawIssue.updated_at,
          relationships: rawIssue.relationships || "Nessun ticket collegato.",
          attachments: formattedFiles,
          notes_history: formattedNotes
        };
        return { content: [{ type: "text", text: JSON.stringify(cleanIssue, null, 2) }] };

      } else if (args.action === "search") {
        // Costruzione URL ricerca con supporto multi-progetto
        let url = `/issues?page_size=${args.limit || 10}`;
        if (config.projectIds.length > 0) {
          config.projectIds.forEach(id => { url += `&project_id[]=${id}`; });
        }
        if (args.query) url += `&search=${encodeURIComponent(args.query)}`;
        // Nota: l'API REST Mantis filtra nativamente per lo stato se passato correttamente? 
        // Solitamente lo 'status' è un filtro più complesso o non standard in GET /issues se non tramite parametri specifici.
        // Se non supportato direttamente, restituiremo tutto e l'AI filtrerà.

        const res = await client.get(url);
        const data = parseResponse(res.status, res.data);
        const issues = data.issues || [];

        const results = issues.map(i => ({
          id: i.id,
          summary: i.summary,
          status: i.status.label || i.status.name,
          priority: i.priority.name,
          handler: i.handler ? i.handler.name : "Unassigned",
          updated_at: i.updated_at
        }));

        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
    }

    // 3. AGGIUNGI NOTA (SEMPRE PRIVATA)
    if (name === "mantis_add_note") {
      const res = await client.post(`/issues/${args.issue_id}/notes`, {
        text: args.text,
        view_state: { name: "private" }
      });
      parseResponse(res.status, res.data || '{}');
      return { content: [{ type: "text", text: `✅ Nota PRIVATA aggiunta con successo al ticket ${args.issue_id}` }] };
    }

    // 4. GESTIONE FILE (FILES)
    if (name === "mantis_files") {
      if (args.action === "upload") {
        if (!args.filename || !args.content) throw new Error("Parametri filename e content (base64) obbligatori per upload.");
        const res = await client.post(`/issues/${args.issue_id}/files`, {
          files: [{ name: args.filename, content: args.content }]
        });
        parseResponse(res.status, res.data || '{}');
        return { content: [{ type: "text", text: `✅ File '${args.filename}' caricato con successo sul ticket ${args.issue_id}` }] };

      } else if (args.action === "download") {
        if (!args.file_id) throw new Error("Parametro file_id obbligatorio per download.");
        // GET /issues/{id}/files/{id} restituisce metadata + content (base64)
        const res = await client.get(`/issues/${args.issue_id}/files/${args.file_id}`);
        const data = parseResponse(res.status, res.data);
        const fileData = data.files ? data.files[0] : data;
        
        if (args.save_path) {
          const buffer = Buffer.from(fileData.content, 'base64');
          fs.writeFileSync(args.save_path, buffer);
          return { 
            content: [{ type: "text", text: `✅ File '${fileData.filename}' salvato con successo in: ${args.save_path}` }] 
          };
        }

        return { 
          content: [
            { type: "text", text: `File: ${fileData.filename} (${fileData.size} bytes)\nContent (Base64 ready)` },
            { type: "text", text: JSON.stringify(fileData, null, 2) }
          ] 
        };
      }
    }

    throw new Error(`Tool sconosciuto: ${name}`);

  } catch (error) {
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