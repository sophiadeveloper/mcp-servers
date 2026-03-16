#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Database setup with sqlite3
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "docs.db");

const db = new sqlite3.Database(DB_PATH);
let hasFTS5 = false;

// Promisify sqlite3 methods
const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this); // 'this' contains lastID and changes
  });
});

const getQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const allQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

async function initDb() {
  await runQuery("PRAGMA journal_mode = WAL");
  await runQuery("PRAGMA foreign_keys = ON");

  await runQuery(`
    CREATE TABLE IF NOT EXISTS shelves (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    DEFAULT '',
      created_at  TEXT    DEFAULT (datetime('now'))
    );
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      shelf_id    INTEGER NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
      file_path   TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      size_bytes  INTEGER DEFAULT 0,
      scanned_at  TEXT    DEFAULT (datetime('now')),
      UNIQUE(shelf_id, file_path)
    );
  `);

  try {
    await runQuery(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title,
        content,
        content='documents',
        content_rowid='id',
        tokenize='unicode61'
      );
    `);
    await runQuery(`
      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END;
    `);
    await runQuery(`
      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
      END;
    `);
    await runQuery(`
      CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
        INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END;
    `);
    hasFTS5 = true;
  } catch (err) {
    if (err.message.includes("no such module: fts5") || err.message.includes("fts5")) {
      console.error("FTS5 non supportato in questa build di sqlite3. Verrà usato LIKE per la ricerca.");
      hasFTS5 = false;
    } else {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

async function ensureShelf(name, description) {
  let shelf = await getQuery("SELECT * FROM shelves WHERE name = ?", [name]);
  if (shelf) return shelf;

  const res = await runQuery("INSERT INTO shelves (name, description) VALUES (?, ?)", [name, description || ""]);
  return await getQuery("SELECT * FROM shelves WHERE id = ?", [res.lastID]);
}

function extractTitle(content, filePath) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.basename(filePath, ".md");
}

async function upsertDocument(shelfId, filePath, title, content, sizeBytes) {
  const existing = await getQuery("SELECT id FROM documents WHERE shelf_id = ? AND file_path = ?", [shelfId, filePath]);

  if (existing) {
    await runQuery(`
      UPDATE documents SET title = ?, content = ?, size_bytes = ?, scanned_at = datetime('now')
      WHERE id = ?
    `, [title, content, sizeBytes, existing.id]);
    return { action: "updated", id: existing.id };
  } else {
    const res = await runQuery(`
      INSERT INTO documents (shelf_id, file_path, title, content, size_bytes)
      VALUES (?, ?, ?, ?, ?)
    `, [shelfId, filePath, title, content, sizeBytes]);
    return { action: "inserted", id: res.lastID };
  }
}

function findMarkdownFiles(dirPath, recursive) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !entry.name.startsWith(".") && entry.name !== "node_modules") {
        results.push(...findMarkdownFiles(fullPath, recursive));
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

function formatSnippet(content, query) {
  if (!query) return content.substring(0, 100) + "...";

  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.substring(0, 100) + "...";

  const start = Math.max(0, idx - 30);
  const end = Math.min(content.length, idx + query.length + 30);
  let snippet = content.substring(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  const highlightRegex = new RegExp("(" + query.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&') + ")", "gi");
  snippet = snippet.replace(highlightRegex, '>>>$1<<<');

  return snippet;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "docs-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "docs_management",
        description: "Gestisce l'indicizzazione e l'organizzazione degli scaffali di documentazione.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["scan_file", "scan_folder", "list_shelves", "create_shelf", "update_shelf", "remove_shelf"],
              description: "Operazione: 'scan_file' (singolo MD), 'scan_folder' (intera cartella), 'list_shelves' (stato scaffali), 'create_shelf', 'update_shelf', 'remove_shelf'."
            },
            file_path: { type: "string" },
            folder_path: { type: "string" },
            shelf: { type: "string", description: "Nome dello scaffale." },
            recursive: { type: "boolean", default: true },
            name: { type: "string", description: "Nuovo nome per create/update." },
            description: { type: "string" },
            new_name: { type: "string" },
            new_description: { type: "string" }
          },
          required: ["action"]
        }
      },
      {
        name: "docs_navigation",
        description: "Ricerca e lettura della documentazione indicizzata.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["search", "read_document", "list_documents"],
              description: "Operazione: 'search' (full-text), 'read_document' (leggi MD), 'list_documents' (elenca file in scaffale)."
            },
            query: { type: "string", description: "Termine di ricerca." },
            shelf: { type: "string" },
            document_id: { type: "number" },
            limit: { type: "number", default: 10 },
            start_line: { type: "number" },
            end_line: { type: "number" },
            search_string: { type: "string" },
            context_lines: { type: "number", default: 10 }
          },
          required: ["action"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // --- 1. DOCS MANAGEMENT ---
    if (name === "docs_management") {
      switch (args.action) {
        case "scan_file": {
          const filePath = path.resolve(args.file_path);
          if (!fs.existsSync(filePath)) throw new Error(`File non trovato: ${filePath}`);
          const content = fs.readFileSync(filePath, "utf-8");
          const title = extractTitle(content, filePath);
          const shelf = await ensureShelf(args.shelf);
          const result = await upsertDocument(shelf.id, filePath, title, content, Buffer.byteLength(content, "utf-8"));
          return { content: [{ type: "text", text: `✅ File ${result.action}: "${title}" → scaffale "${args.shelf}"` }] };
        }

        case "scan_folder": {
          const folderPath = path.resolve(args.folder_path);
          if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) throw new Error(`Cartella non trovata: ${folderPath}`);
          const files = findMarkdownFiles(folderPath, args.recursive !== false);
          if (files.length === 0) return { content: [{ type: "text", text: `⚠️ Nessun file .md trovato.` }] };
          const shelf = await ensureShelf(args.shelf);
          const res = { inserted: 0, updated: 0, errors: [] };
          await runQuery("BEGIN TRANSACTION");
          try {
            for (const f of files) {
              try {
                const doc = fs.readFileSync(f, "utf-8");
                const title = extractTitle(doc, f);
                const size = Buffer.byteLength(doc, "utf-8");
                const existing = await getQuery("SELECT id FROM documents WHERE shelf_id = ? AND file_path = ?", [shelf.id, f]);
                if (existing) { await runQuery("UPDATE documents SET title = ?, content = ?, size_bytes = ?, scanned_at = datetime('now') WHERE id = ?", [title, doc, size, existing.id]); res.updated++; }
                else { await runQuery("INSERT INTO documents (shelf_id, file_path, title, content, size_bytes) VALUES (?, ?, ?, ?, ?)", [shelf.id, f, title, doc, size]); res.inserted++; }
              } catch (e) { res.errors.push({ file: f, error: e.message }); }
            }
            await runQuery("COMMIT");
          } catch (e) { await runQuery("ROLLBACK"); throw e; }
          return { content: [{ type: "text", text: `✅ Scansione completata Scaffale "${args.shelf}": Inseriti: ${res.inserted} | Aggiornati: ${res.updated}` }] };
        }

        case "list_shelves": {
          const shelves = await allQuery(`SELECT s.name, s.description, COUNT(d.id) AS document_count FROM shelves s LEFT JOIN documents d ON d.shelf_id = s.id GROUP BY s.id ORDER BY s.name`);
          return { content: [{ type: "text", text: JSON.stringify(shelves, null, 2) }] };
        }

        case "create_shelf": {
          const existing = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.name]);
          if (existing) throw new Error(`Lo scaffale "${args.name}" esiste già.`);
          await runQuery("INSERT INTO shelves (name, description) VALUES (?, ?)", [args.name, args.description || ""]);
          return { content: [{ type: "text", text: `✅ Scaffale "${args.name}" creato.` }] };
        }

        case "update_shelf": {
          const s = await getQuery("SELECT * FROM shelves WHERE name = ?", [args.shelf]);
          if (!s) throw new Error(`Scaffale non trovato: ${args.shelf}`);
          const newName = args.new_name || s.name;
          const newDesc = args.new_description !== undefined ? args.new_description : s.description;
          await runQuery("UPDATE shelves SET name = ?, description = ? WHERE id = ?", [newName, newDesc, s.id]);
          return { content: [{ type: "text", text: `✅ Scaffale aggiornato: "${s.name}" → "${newName}"` }] };
        }

        case "remove_shelf": {
          const s = await getQuery("SELECT id, name FROM shelves WHERE name = ?", [args.shelf]);
          if (!s) throw new Error(`Scaffale non trovato: ${args.shelf}`);
          await runQuery("DELETE FROM documents WHERE shelf_id = ?", [s.id]);
          await runQuery("DELETE FROM shelves WHERE id = ?", [s.id]);
          return { content: [{ type: "text", text: `✅ Scaffale "${s.name}" rimosso.` }] };
        }
        default: throw new Error(`Azione non valida per docs_management: ${args.action}`);
      }
    }

    // --- 2. DOCS NAVIGATION ---
    if (name === "docs_navigation") {
      switch (args.action) {
        case "search": {
          const limit = args.limit || 10;
          let rows = [];
          if (hasFTS5) {
            let sql = `SELECT d.id, d.title, d.file_path, s.name AS shelf_name, snippet(documents_fts, 1, '>>>', '<<<', '...', 40) AS snippet FROM documents_fts JOIN documents d ON d.id = documents_fts.rowid JOIN shelves s ON s.id = d.shelf_id WHERE documents_fts MATCH ?`;
            let params = [args.query];
            if (args.shelf) {
              const s = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.shelf]);
              if (!s) throw new Error(`Scaffale non trovato: ${args.shelf}`);
              sql += ` AND d.shelf_id = ?`;
              params.push(s.id);
            }
            sql += ` ORDER BY rank LIMIT ?`;
            params.push(limit);
            rows = await allQuery(sql, params);
          } else {
            const term = `%${args.query}%`;
            let sql = `SELECT d.id, d.title, d.file_path, d.content, s.name AS shelf_name FROM documents d JOIN shelves s ON s.id = d.shelf_id WHERE (d.title LIKE ? OR d.content LIKE ?)`;
            let params = [term, term];
            if (args.shelf) {
              const s = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.shelf]);
              if (!s) throw new Error(`Scaffale non trovato: ${args.shelf}`);
              sql += ` AND d.shelf_id = ?`;
              params.push(s.id);
            }
            sql += ` LIMIT ?`;
            params.push(limit);
            const raw = await allQuery(sql, params);
            rows = raw.map(r => ({ ...r, snippet: formatSnippet(r.content, args.query) }));
          }
          if (rows.length === 0) return { content: [{ type: "text", text: "Nessun risultato." }] };
          return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
        }

        case "read_document": {
          const doc = await getQuery(`SELECT d.title, d.file_path, d.content, s.name AS shelf_name FROM documents d JOIN shelves s ON s.id = d.shelf_id WHERE d.id = ?`, [args.document_id]);
          if (!doc) throw new Error(`Documento non trovato ID: ${args.document_id}`);
          let out = doc.content;
          const lines = out.split(/\r?\n/);
          if (args.search_string) {
            const q = args.search_string.toLowerCase();
            const ctx = args.context_lines || 10;
            let blocks = [];
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(q)) {
                const s = Math.max(0, i - ctx), e = Math.min(lines.length, i + ctx + 1);
                blocks.push(`--- Match at line ${i + 1} ---\n` + lines.slice(s, e).map((l, idx) => `${s + idx + 1}: ${l}`).join('\n'));
              }
            }
            out = blocks.length > 0 ? blocks.join('\n\n') : `Nessun match per "${args.search_string}"`;
          } else if (args.start_line || args.end_line) {
            const s = args.start_line ? Math.max(1, args.start_line) - 1 : 0;
            const e = args.end_line ? Math.min(lines.length, args.end_line) : lines.length;
            out = lines.slice(s, e).map((l, idx) => `${s + idx + 1}: ${l}`).join('\n');
          }
          return { content: [{ type: "text", text: `Doc: ${doc.title} (${doc.shelf_name})\n\n${out}` }] };
        }

        case "list_documents": {
          const s = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.shelf]);
          if (!s) throw new Error(`Scaffale non trovato: ${args.shelf}`);
          const docs = await allQuery(`SELECT id, title, file_path, size_bytes FROM documents WHERE shelf_id = ? ORDER BY title`, [s.id]);
          return { content: [{ type: "text", text: JSON.stringify(docs, null, 2) }] };
        }
        default: throw new Error(`Azione non valida per docs_navigation: ${args.action}`);
      }
    }

    throw new Error(`Tool sconosciuto: ${name}`);
  } catch (error) {
    return { content: [{ type: "text", text: `❌ Errore: ${error.message}` }], isError: true };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  await initDb();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
