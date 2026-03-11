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
        name: "docs_scan_file",
        description: "Scansiona un singolo file .md e lo indicizza in uno scaffale. Se lo scaffale non esiste viene creato automaticamente.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Percorso assoluto al file .md da scansionare." },
            shelf: { type: "string", description: "Nome dello scaffale in cui indicizzare il documento." }
          },
          required: ["file_path", "shelf"]
        }
      },
      {
        name: "docs_scan_folder",
        description: "Scansiona una cartella per file .md e li indicizza tutti in uno scaffale. Se lo scaffale non esiste viene creato automaticamente.",
        inputSchema: {
          type: "object",
          properties: {
            folder_path: { type: "string", description: "Percorso assoluto alla cartella da scansionare." },
            shelf: { type: "string", description: "Nome dello scaffale in cui indicizzare i documenti." },
            recursive: { type: "boolean", description: "Se true (default), scansiona anche le sotto-cartelle." }
          },
          required: ["folder_path", "shelf"]
        }
      },
      {
        name: "docs_search",
        description: "Ricerca full-text nella documentazione indicizzata. Restituisce risultati ordinati per rilevanza con snippet di contesto.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Testo da cercare." },
            shelf: { type: "string", description: "Opzionale: limita la ricerca a uno scaffale specifico." },
            limit: { type: "number", description: "Numero massimo di risultati (default 10)." }
          },
          required: ["query"]
        }
      },
      {
        name: "docs_read_document",
        description: "Recupera il contenuto markdown di un documento usando l'ID restituito da docs_search. Predefinito: intero documento. Usa start_line/end_line o search_string per estrarre sotto-porzioni.",
        inputSchema: {
          type: "object",
          properties: {
            document_id: { type: "number", description: "L'ID univoco del documento." },
            start_line: { type: "number", description: "Riga di inizio opzionale (1-based)." },
            end_line: { type: "number", description: "Riga di fine opzionale (1-based)." },
            search_string: { type: "string", description: "Stringa da cercare nel documento (ignora maiuscole). Se fornito, estrae i blocchi corrispondenti con contesto." },
            context_lines: { type: "number", description: "Numero di righe di contesto prima e dopo (default 10)." }
          },
          required: ["document_id"]
        }
      },
      {
        name: "docs_list_shelves",
        description: "Elenca tutti gli scaffali disponibili con conteggio documenti e descrizione.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "docs_list_documents",
        description: "Elenca i documenti indicizzati in uno scaffale.",
        inputSchema: {
          type: "object",
          properties: {
            shelf: { type: "string", description: "Nome dello scaffale." }
          },
          required: ["shelf"]
        }
      },
      {
        name: "docs_create_shelf",
        description: "Crea un nuovo scaffale con nome e descrizione.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nome univoco dello scaffale." },
            description: { type: "string", description: "Descrizione dello scaffale." }
          },
          required: ["name"]
        }
      },
      {
        name: "docs_update_shelf",
        description: "Modifica il nome e/o la descrizione di uno scaffale esistente.",
        inputSchema: {
          type: "object",
          properties: {
            shelf: { type: "string", description: "Nome attuale dello scaffale da modificare." },
            new_name: { type: "string", description: "Nuovo nome (opzionale)." },
            new_description: { type: "string", description: "Nuova descrizione (opzionale)." }
          },
          required: ["shelf"]
        }
      },
      {
        name: "docs_remove_shelf",
        description: "Rimuove uno scaffale e tutti i suoi documenti indicizzati.",
        inputSchema: {
          type: "object",
          properties: {
            shelf: { type: "string", description: "Nome dello scaffale da rimuovere." }
          },
          required: ["shelf"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "docs_scan_file") {
      const filePath = path.resolve(args.file_path);
      if (!fs.existsSync(filePath)) throw new Error(`File non trovato: ${filePath}`);
      if (!filePath.toLowerCase().endsWith(".md")) throw new Error("Solo file .md sono supportati.");

      const content = fs.readFileSync(filePath, "utf-8");
      const title = extractTitle(content, filePath);
      const sizeBytes = Buffer.byteLength(content, "utf-8");

      const shelf = await ensureShelf(args.shelf);
      const result = await upsertDocument(shelf.id, filePath, title, content, sizeBytes);

      return {
        content: [{
          type: "text",
          text: `✅ File ${result.action}: "${title}" → scaffale "${args.shelf}" (${sizeBytes} bytes)`
        }]
      };
    }

    if (name === "docs_scan_folder") {
      const folderPath = path.resolve(args.folder_path);
      if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        throw new Error(`Cartella non trovata: ${folderPath}`);
      }

      const recursive = args.recursive !== false;
      const files = findMarkdownFiles(folderPath, recursive);

      if (files.length === 0) {
        return { content: [{ type: "text", text: `⚠️ Nessun file .md trovato in: ${folderPath}` }] };
      }

      const shelf = await ensureShelf(args.shelf);
      const results = { inserted: 0, updated: 0, errors: [] };

      // In sqlite3 this can be done in parallel or sequentially. We do it sequentially.
      await runQuery("BEGIN TRANSACTION");
      try {
        for (const filePath of files) {
          try {
            const content = fs.readFileSync(filePath, "utf-8");
            const title = extractTitle(content, filePath);
            const sizeBytes = Buffer.byteLength(content, "utf-8");

            const existing = await getQuery("SELECT id FROM documents WHERE shelf_id = ? AND file_path = ?", [shelf.id, filePath]);
            if (existing) {
              await runQuery("UPDATE documents SET title = ?, content = ?, size_bytes = ?, scanned_at = datetime('now') WHERE id = ?", [title, content, sizeBytes, existing.id]);
              results.updated++;
            } else {
              await runQuery("INSERT INTO documents (shelf_id, file_path, title, content, size_bytes) VALUES (?, ?, ?, ?, ?)", [shelf.id, filePath, title, content, sizeBytes]);
              results.inserted++;
            }
          } catch (err) {
            results.errors.push({ file: filePath, error: err.message });
          }
        }
        await runQuery("COMMIT");
      } catch (err) {
        await runQuery("ROLLBACK");
        throw err;
      }

      let summary = `✅ Scansione completata → scaffale "${args.shelf}"\n`;
      summary += `   File trovati: ${files.length}\n`;
      summary += `   Inseriti: ${results.inserted} | Aggiornati: ${results.updated}`;
      if (results.errors.length > 0) {
        summary += `\n   ⚠️ Errori: ${results.errors.length}`;
        for (const e of results.errors) {
          summary += `\n     - ${e.file}: ${e.error}`;
        }
      }

      return { content: [{ type: "text", text: summary }] };
    }

    if (name === "docs_search") {
      const limit = args.limit || 10;
      let rows = [];

      if (hasFTS5) {
        let sql = `
          SELECT d.id, d.title, d.file_path, s.name AS shelf_name,
                 snippet(documents_fts, 1, '>>>', '<<<', '...', 40) AS snippet
          FROM documents_fts
          JOIN documents d ON d.id = documents_fts.rowid
          JOIN shelves s ON s.id = d.shelf_id
          WHERE documents_fts MATCH ?
        `;
        let params = [args.query];

        if (args.shelf) {
          const shelf = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.shelf]);
          if (!shelf) throw new Error(`Scaffale non trovato: ${args.shelf}`);
          sql += ` AND d.shelf_id = ?`;
          params.push(shelf.id);
        }

        sql += ` ORDER BY rank LIMIT ?`;
        params.push(limit);

        rows = await allQuery(sql, params);
      } else {
        const searchTerm = `%${args.query}%`;
        let sql = `
          SELECT d.id, d.title, d.file_path, d.content, s.name AS shelf_name
          FROM documents d
          JOIN shelves s ON s.id = d.shelf_id
          WHERE (d.title LIKE ? OR d.content LIKE ?)
        `;
        let params = [searchTerm, searchTerm];

        if (args.shelf) {
          const shelf = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.shelf]);
          if (!shelf) throw new Error(`Scaffale non trovato: ${args.shelf}`);
          sql += ` AND d.shelf_id = ?`;
          params.push(shelf.id);
        }

        sql += ` LIMIT ?`;
        params.push(limit);

        const rawRows = await allQuery(sql, params);
        rows = rawRows.map(r => ({
          id: r.id,
          title: r.title,
          file_path: r.file_path,
          shelf_name: r.shelf_name,
          snippet: formatSnippet(r.content, args.query)
        }));
      }

      if (rows.length === 0) {
        return { content: [{ type: "text", text: `Nessun risultato trovato per: "${args.query}"` }] };
      }

      const results = rows.map((row, idx) => ({
        position: idx + 1,
        id: row.id,
        title: row.title,
        shelf: row.shelf_name,
        file_path: row.file_path,
        snippet: row.snippet
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ query: args.query, engine: hasFTS5 ? "fts5" : "like", total: results.length, results }, null, 2)
        }]
      };
    }

    if (name === "docs_read_document") {
      const doc = await getQuery(`
        SELECT d.id, d.title, d.file_path, d.content, s.name AS shelf_name
        FROM documents d
        JOIN shelves s ON s.id = d.shelf_id
        WHERE d.id = ?
      `, [args.document_id]);

      if (!doc) throw new Error(`Documento non trovato con ID: ${args.document_id}`);

      let outContent = doc.content;
      
      const lines = outContent.split(/\r?\n/);
      
      if (args.search_string) {
        const queryTerm = args.search_string.toLowerCase();
        const contextLines = args.context_lines !== undefined ? Math.max(0, args.context_lines) : 10;
        let matchedBlocks = [];
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryTerm)) {
            const start = Math.max(0, i - contextLines);
            const end = Math.min(lines.length, i + contextLines + 1);
            let block = lines.slice(start, end).map((l, idx) => `${start + idx + 1}: ${l}`).join('\n');
            matchedBlocks.push(`--- Match at line ${i + 1} ---\n` + block);
          }
        }
        
        if (matchedBlocks.length > 0) {
           outContent = matchedBlocks.join('\n\n');
        } else {
           outContent = `Nessuna corrispondenza trovata per: "${args.search_string}"`;
        }
      } else if (args.start_line !== undefined || args.end_line !== undefined) {
        const start = args.start_line ? Math.max(1, args.start_line) - 1 : 0;
        const end = args.end_line ? Math.min(lines.length, args.end_line) : lines.length;
        outContent = lines.slice(start, end).map((l, idx) => `${start + idx + 1}: ${l}`).join('\n');
      }

      return {
        content: [{
          type: "text",
          text: `Titolo: ${doc.title}\nScaffale: ${doc.shelf_name}\nPercorso Originale: ${doc.file_path}\n\n${outContent}`
        }]
      };
    }

    if (name === "docs_list_shelves") {
      const shelves = await allQuery(`
        SELECT s.name, s.description, s.created_at,
               COUNT(d.id) AS document_count,
               COALESCE(SUM(d.size_bytes), 0) AS total_bytes
        FROM shelves s
        LEFT JOIN documents d ON d.shelf_id = s.id
        GROUP BY s.id
        ORDER BY s.name
      `);

      if (shelves.length === 0) {
        return { content: [{ type: "text", text: "Nessuno scaffale trovato. Usa docs_scan_file o docs_scan_folder per iniziare." }] };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(shelves, null, 2)
        }]
      };
    }

    if (name === "docs_list_documents") {
      const shelf = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.shelf]);
      if (!shelf) throw new Error(`Scaffale non trovato: ${args.shelf}`);

      const docs = await allQuery(`
        SELECT id, title, file_path, size_bytes, scanned_at
        FROM documents
        WHERE shelf_id = ?
        ORDER BY title
      `, [shelf.id]);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ shelf: args.shelf, count: docs.length, documents: docs }, null, 2)
        }]
      };
    }

    if (name === "docs_create_shelf") {
      const existing = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.name]);
      if (existing) throw new Error(`Lo scaffale "${args.name}" esiste già.`);

      await runQuery("INSERT INTO shelves (name, description) VALUES (?, ?)", [args.name, args.description || ""]);

      return {
        content: [{
          type: "text",
          text: `✅ Scaffale "${args.name}" creato con successo.`
        }]
      };
    }

    if (name === "docs_update_shelf") {
      const shelf = await getQuery("SELECT * FROM shelves WHERE name = ?", [args.shelf]);
      if (!shelf) throw new Error(`Scaffale non trovato: ${args.shelf}`);

      if (!args.new_name && args.new_description === undefined) {
        throw new Error("Specificare almeno new_name o new_description.");
      }

      const newName = args.new_name || shelf.name;
      const newDesc = args.new_description !== undefined ? args.new_description : shelf.description;

      if (args.new_name && args.new_name !== shelf.name) {
        const conflict = await getQuery("SELECT id FROM shelves WHERE name = ?", [args.new_name]);
        if (conflict) throw new Error(`Lo scaffale "${args.new_name}" esiste già.`);
      }

      await runQuery("UPDATE shelves SET name = ?, description = ? WHERE id = ?", [newName, newDesc, shelf.id]);

      return {
        content: [{
          type: "text",
          text: `✅ Scaffale aggiornato: "${shelf.name}" → nome: "${newName}", descrizione: "${newDesc}"`
        }]
      };
    }

    if (name === "docs_remove_shelf") {
      const shelf = await getQuery("SELECT id, name FROM shelves WHERE name = ?", [args.shelf]);
      if (!shelf) throw new Error(`Scaffale non trovato: ${args.shelf}`);

      const docCountData = await getQuery("SELECT COUNT(*) AS cnt FROM documents WHERE shelf_id = ?", [shelf.id]);
      const docCount = docCountData.cnt;

      await runQuery("DELETE FROM documents WHERE shelf_id = ?", [shelf.id]);
      await runQuery("DELETE FROM shelves WHERE id = ?", [shelf.id]);

      return {
        content: [{
          type: "text",
          text: `✅ Scaffale "${shelf.name}" rimosso con ${docCount} documenti.`
        }]
      };
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
