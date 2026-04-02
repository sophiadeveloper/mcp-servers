#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "docs.db");

const db = new sqlite3.Database(DB_PATH);
let hasFTS5 = false;

const KNOWN_FEATURES = {
  tags: {
    noticeText: [
      "Notice: the tags feature is new and has not been initialized yet.",
      "Recommended one-time workflow:",
      "1. Check docs_management feature_status.",
      "2. Review docs_management list_shelves and docs_navigation list_documents.",
      "3. Create the shared tag dictionary with docs_management create_tag.",
      "4. Classify the current documentation with docs_management bulk_set_document_tags."
    ].join("\n")
  },
  scan_sources: {
    noticeText: [
      "Notice: scan_sources was initialized from legacy documents using file-level backfill only.",
      "Current limitation: new markdown files added under existing documentation folders will not be discovered automatically.",
      "Recommended next step: run docs_management scan_folder on each real documentation root to register folder sources and enable full folder-based resync."
    ].join("\n")
  }
};

const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err);
    else resolve(this);
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

function textBlock(text) {
  return { type: "text", text };
}

function responseFromBlocks(blocks, isError = false) {
  const content = blocks
    .filter(Boolean)
    .map((block) => (typeof block === "string" ? textBlock(block) : block));

  if (isError) return { content, isError: true };
  return { content };
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function slugifyShelfName(shelfName) {
  const normalized = String(shelfName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "shelf";
}

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} deve essere un intero positivo.`);
  }
  return parsed;
}

function buildShelfUri(shelfId, shelfName = "") {
  const normalizedShelfId = normalizePositiveInteger(shelfId, "shelf_id");
  const slug = slugifyShelfName(shelfName);
  return `docs://shelf/${encodeURIComponent(`${normalizedShelfId}-${slug}`)}`;
}

function buildDocumentUri(documentId) {
  const normalizedDocumentId = normalizePositiveInteger(documentId, "document_id");
  return `docs://document/${encodeURIComponent(String(normalizedDocumentId))}`;
}

function parseDocsUri(uri) {
  if (typeof uri !== "string" || uri.trim() === "") {
    throw new Error("URI resource mancante o non valida: atteso valore stringa non vuoto.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(uri);
  } catch {
    throw new Error(`URI resource malformata: "${uri}". Formato atteso: docs://<type>/<id>.`);
  }

  if (parsedUrl.protocol !== "docs:") {
    throw new Error(`Schema URI non supportato: "${parsedUrl.protocol}". Usare schema "docs://".`);
  }

  const resourceType = parsedUrl.hostname;
  const rawPathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  if (rawPathSegments.length !== 1) {
    throw new Error(`URI resource non valida: "${uri}". Path atteso con un solo segmento identificativo.`);
  }

  const identifier = decodeURIComponent(rawPathSegments[0]);
  if (!identifier) {
    throw new Error(`URI resource non valida: "${uri}". Identificatore mancante.`);
  }

  if (resourceType === "shelf") {
    const match = /^(\d+)(?:-.+)?$/.exec(identifier);
    if (!match) {
      throw new Error(
        `URI shelf non valida: "${uri}". Formato atteso: docs://shelf/<shelf_id>[-slug].`
      );
    }
    return { type: "shelf", shelfId: normalizePositiveInteger(match[1], "shelf_id") };
  }

  if (resourceType === "document") {
    return { type: "document", documentId: normalizePositiveInteger(identifier, "document_id") };
  }

  throw new Error(
    `Tipo resource non supportato: "${resourceType}". Valori supportati: shelf, document.`
  );
}

function normalizePathValue(inputPath) {
  return path.resolve(String(inputPath));
}

function comparePathKey(inputPath) {
  const resolved = normalizePathValue(inputPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function requireNonEmptyString(value, fieldName) {
  if (isBlank(value)) {
    throw new Error(`Parametro obbligatorio mancante o vuoto: ${fieldName}`);
  }
  return value.trim();
}

function normalizeBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return value === true;
}

function normalizeLimit(value, defaultValue = 10) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.floor(parsed);
}

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractTitle(content, filePath) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.basename(filePath, ".md");
}

function formatSnippet(content, query) {
  if (!query) return `${content.substring(0, 100)}...`;

  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return `${content.substring(0, 100)}...`;

  const start = Math.max(0, idx - 30);
  const end = Math.min(content.length, idx + query.length + 30);
  let snippet = content.substring(start, end);
  if (start > 0) snippet = `...${snippet}`;
  if (end < content.length) snippet = `${snippet}...`;

  const highlightRegex = new RegExp(`(${query.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "gi");
  return snippet.replace(highlightRegex, ">>>$1<<<");
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
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      results.push(normalizePathValue(fullPath));
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}

function isFileCoveredByFolderSource(filePath, folderPath, recursive) {
  const relativePath = path.relative(normalizePathValue(folderPath), normalizePathValue(filePath));
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return false;
  }

  if (recursive) return true;
  return !relativePath.includes(path.sep);
}

async function columnExists(tableName, columnName) {
  const columns = await allQuery(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

async function ensureFeatureStateRow(featureKey) {
  await runQuery("INSERT OR IGNORE INTO feature_state (feature_key) VALUES (?)", [featureKey]);
  return getQuery("SELECT * FROM feature_state WHERE feature_key = ?", [featureKey]);
}

async function consumeFeatureNotice(featureKey) {
  const feature = KNOWN_FEATURES[featureKey];
  if (!feature || !feature.noticeText) return null;

  const state = await ensureFeatureStateRow(featureKey);
  if (state.notice_shown_at) return null;

  await runQuery(
    "UPDATE feature_state SET notice_shown_at = datetime('now'), updated_at = datetime('now') WHERE feature_key = ?",
    [featureKey]
  );
  return feature.noticeText;
}

async function getScanSourceCounts() {
  const sourceStats = await getQuery(
    `SELECT
       COUNT(*) AS source_count,
       SUM(CASE WHEN source_type = 'folder' THEN 1 ELSE 0 END) AS folder_source_count,
       SUM(CASE WHEN source_type = 'file' THEN 1 ELSE 0 END) AS file_source_count
     FROM scan_sources`
  );

  return {
    source_count: sourceStats.source_count || 0,
    folder_source_count: sourceStats.folder_source_count || 0,
    file_source_count: sourceStats.file_source_count || 0
  };
}

function isScanSourcesLegacyOnly(scanSourceCounts) {
  return scanSourceCounts.folder_source_count === 0 && scanSourceCounts.file_source_count > 0;
}

async function consumeScanSourcesLegacyNoticeIfNeeded() {
  const counts = await getScanSourceCounts();
  if (!isScanSourcesLegacyOnly(counts)) return null;
  return consumeFeatureNotice("scan_sources");
}

async function updateFeatureState(featureKey, updates = {}) {
  const current = await ensureFeatureStateRow(featureKey);
  const nextStatusJson = Object.prototype.hasOwnProperty.call(updates, "statusJson")
    ? JSON.stringify(updates.statusJson)
    : current.status_json;

  if (updates.initialized && !current.initialized_at) {
    await runQuery(
      "UPDATE feature_state SET initialized_at = datetime('now'), status_json = ?, updated_at = datetime('now') WHERE feature_key = ?",
      [nextStatusJson, featureKey]
    );
    return;
  }

  await runQuery(
    "UPDATE feature_state SET status_json = ?, updated_at = datetime('now') WHERE feature_key = ?",
    [nextStatusJson, featureKey]
  );
}

async function ensureShelf(name, description = "") {
  const shelfName = requireNonEmptyString(name, "shelf");
  const existing = await getQuery("SELECT * FROM shelves WHERE name = ?", [shelfName]);
  if (existing) return existing;

  const result = await runQuery(
    "INSERT INTO shelves (name, description) VALUES (?, ?)",
    [shelfName, description || ""]
  );
  return getQuery("SELECT * FROM shelves WHERE id = ?", [result.lastID]);
}

async function getShelfByName(name) {
  const shelfName = requireNonEmptyString(name, "shelf");
  const shelf = await getQuery("SELECT * FROM shelves WHERE name = ?", [shelfName]);
  if (!shelf) throw new Error(`Scaffale non trovato: ${shelfName}`);
  return shelf;
}

async function getShelfById(shelfId) {
  const normalizedShelfId = normalizePositiveInteger(shelfId, "shelf_id");
  const shelf = await getQuery("SELECT * FROM shelves WHERE id = ?", [normalizedShelfId]);
  if (!shelf) throw new Error(`Scaffale non trovato con shelf_id: ${normalizedShelfId}`);
  return shelf;
}

async function ensureScanSource(sourceType, sourcePath, shelfId, recursive = false) {
  const normalizedType = sourceType === "folder" ? "folder" : "file";
  const normalizedSourcePath = normalizePathValue(sourcePath);
  const normalizedRecursive = normalizedType === "folder" && recursive ? 1 : 0;

  const existing = await getQuery(
    `SELECT * FROM scan_sources
     WHERE shelf_id = ? AND source_type = ? AND source_path = ? AND recursive = ?`,
    [shelfId, normalizedType, normalizedSourcePath, normalizedRecursive]
  );
  if (existing) return existing;

  const result = await runQuery(
    `INSERT INTO scan_sources (shelf_id, source_type, source_path, recursive)
     VALUES (?, ?, ?, ?)`,
    [shelfId, normalizedType, normalizedSourcePath, normalizedRecursive]
  );
  return getQuery("SELECT * FROM scan_sources WHERE id = ?", [result.lastID]);
}

async function upsertDocument(shelfId, filePath, title, content, sizeBytes, sourceId = null) {
  const normalizedFilePath = normalizePathValue(filePath);
  const existing = await getQuery(
    "SELECT id FROM documents WHERE shelf_id = ? AND file_path = ?",
    [shelfId, normalizedFilePath]
  );

  if (existing) {
    if (sourceId === null) {
      await runQuery(
        `UPDATE documents
         SET title = ?, content = ?, size_bytes = ?, scanned_at = datetime('now')
         WHERE id = ?`,
        [title, content, sizeBytes, existing.id]
      );
    } else {
      await runQuery(
        `UPDATE documents
         SET title = ?, content = ?, size_bytes = ?, scanned_at = datetime('now'), source_id = ?
         WHERE id = ?`,
        [title, content, sizeBytes, sourceId, existing.id]
      );
    }
    return { action: "updated", id: existing.id };
  }

  const result = await runQuery(
    `INSERT INTO documents (shelf_id, file_path, title, content, size_bytes, source_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [shelfId, normalizedFilePath, title, content, sizeBytes, sourceId]
  );
  return { action: "inserted", id: result.lastID };
}

async function syncMarkdownFile({ shelfId, filePath, sourceId }) {
  const normalizedFilePath = normalizePathValue(filePath);
  const content = fs.readFileSync(normalizedFilePath, "utf-8");
  const title = extractTitle(content, normalizedFilePath);
  const sizeBytes = Buffer.byteLength(content, "utf-8");
  return upsertDocument(shelfId, normalizedFilePath, title, content, sizeBytes, sourceId);
}

async function attachTagsToRows(rows) {
  const documentIds = [...new Set(rows.map((row) => row.id))];
  if (documentIds.length === 0) return rows;

  const placeholders = documentIds.map(() => "?").join(", ");
  const tagRows = await allQuery(
    `SELECT dt.document_id, t.name
     FROM document_tags dt
     JOIN tags t ON t.id = dt.tag_id
     WHERE dt.document_id IN (${placeholders})
     ORDER BY t.name`,
    documentIds
  );

  const tagsByDocumentId = new Map();
  for (const tagRow of tagRows) {
    if (!tagsByDocumentId.has(tagRow.document_id)) {
      tagsByDocumentId.set(tagRow.document_id, []);
    }
    tagsByDocumentId.get(tagRow.document_id).push(tagRow.name);
  }

  return rows.map((row) => ({
    ...row,
    tags: tagsByDocumentId.get(row.id) || []
  }));
}

async function getDocumentTags(documentId) {
  const rows = await allQuery(
    `SELECT t.name
     FROM document_tags dt
     JOIN tags t ON t.id = dt.tag_id
     WHERE dt.document_id = ?
     ORDER BY t.name`,
    [documentId]
  );
  return rows.map((row) => row.name);
}

function normalizeTagNames(rawTags) {
  if (!Array.isArray(rawTags)) {
    throw new Error("Il parametro tags deve essere un array di stringhe.");
  }

  const normalized = [];
  const seen = new Set();
  for (const rawTag of rawTags) {
    const tagName = requireNonEmptyString(rawTag, "tags[]");
    const key = tagName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tagName);
  }

  return normalized;
}

function normalizeOptionalTagNames(rawTags) {
  if (rawTags === undefined) return [];
  return normalizeTagNames(rawTags);
}

async function validateKnownTags(tagNames) {
  if (tagNames.length === 0) return [];

  const placeholders = tagNames.map(() => "?").join(", ");
  const rows = await allQuery(
    `SELECT id, name FROM tags WHERE name IN (${placeholders})`,
    tagNames
  );

  const rowsByKey = new Map(rows.map((row) => [row.name.toLowerCase(), row]));
  const missing = tagNames.filter((tagName) => !rowsByKey.has(tagName.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(
      `Tag non definiti nel dizionario: ${missing.join(", ")}. Crearli prima con docs_management create_tag.`
    );
  }

  return tagNames.map((tagName) => rowsByKey.get(tagName.toLowerCase()));
}

async function ensureDocumentExists(documentId) {
  const normalizedId = normalizePositiveInteger(documentId, "document_id");

  const document = await getQuery(
    `SELECT d.*, s.name AS shelf_name
     FROM documents d
     JOIN shelves s ON s.id = d.shelf_id
     WHERE d.id = ?`,
    [normalizedId]
  );
  if (!document) throw new Error(`Documento non trovato ID: ${documentId}`);
  return document;
}

async function replaceDocumentTags(documentId, tagNames) {
  const tagRows = await validateKnownTags(tagNames);

  await runQuery("BEGIN TRANSACTION");
  try {
    await runQuery("DELETE FROM document_tags WHERE document_id = ?", [documentId]);
    for (const tagRow of tagRows) {
      await runQuery(
        "INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)",
        [documentId, tagRow.id]
      );
    }
    await runQuery("COMMIT");
  } catch (error) {
    await runQuery("ROLLBACK");
    throw error;
  }
}

function buildTagFilterClause(tagNames, tagMatch = "all") {
  if (tagNames.length === 0) return { clause: "", params: [] };

  const placeholders = tagNames.map(() => "?").join(", ");
  const minimumMatches = tagMatch === "any" ? 1 : tagNames.length;
  return {
    clause: `
      AND d.id IN (
        SELECT dt.document_id
        FROM document_tags dt
        JOIN tags t ON t.id = dt.tag_id
        WHERE t.name IN (${placeholders})
        GROUP BY dt.document_id
        HAVING COUNT(DISTINCT t.id) >= ?
      )`,
    params: [...tagNames, minimumMatches]
  };
}

async function searchDocuments(args) {
  const limit = normalizeLimit(args.limit, 10);
  const includeTags = args.include_tags === true;
  const tagNames = normalizeOptionalTagNames(args.tags);
  const tagMatch = args.tag_match === "any" ? "any" : "all";
  const hasQuery = !isBlank(args.query);
  const shelf = args.shelf ? await getShelfByName(args.shelf) : null;

  if (!hasQuery && tagNames.length === 0) {
    throw new Error("Specificare almeno query o tags per la ricerca.");
  }

  const tagFilter = buildTagFilterClause(tagNames, tagMatch);
  let rows = [];

  if (hasQuery && hasFTS5) {
    let sql = `
      SELECT d.id, d.title, d.file_path, s.id AS shelf_id, s.name AS shelf_name,
             snippet(documents_fts, 1, '>>>', '<<<', '...', 40) AS snippet
      FROM documents_fts
      JOIN documents d ON d.id = documents_fts.rowid
      JOIN shelves s ON s.id = d.shelf_id
      WHERE documents_fts MATCH ?`;
    const params = [args.query.trim()];

    if (shelf) {
      sql += " AND d.shelf_id = ?";
      params.push(shelf.id);
    }

    sql += tagFilter.clause;
    params.push(...tagFilter.params);
    sql += " ORDER BY bm25(documents_fts), d.title LIMIT ?";
    params.push(limit);

    rows = await allQuery(sql, params);
  } else if (hasQuery) {
    let sql = `
      SELECT d.id, d.title, d.file_path, d.content, s.id AS shelf_id, s.name AS shelf_name
      FROM documents d
      JOIN shelves s ON s.id = d.shelf_id
      WHERE (d.title LIKE ? OR d.content LIKE ?)`;
    const term = `%${args.query.trim()}%`;
    const params = [term, term];

    if (shelf) {
      sql += " AND d.shelf_id = ?";
      params.push(shelf.id);
    }

    sql += tagFilter.clause;
    params.push(...tagFilter.params);
    sql += " ORDER BY d.title LIMIT ?";
    params.push(limit);

    const rawRows = await allQuery(sql, params);
    rows = rawRows.map((row) => ({
      id: row.id,
      title: row.title,
      file_path: row.file_path,
      shelf_id: row.shelf_id,
      shelf_name: row.shelf_name,
      snippet: formatSnippet(row.content, args.query.trim())
    }));
  } else {
    let sql = `
      SELECT d.id, d.title, d.file_path, s.id AS shelf_id, s.name AS shelf_name
      FROM documents d
      JOIN shelves s ON s.id = d.shelf_id
      WHERE 1 = 1`;
    const params = [];

    if (shelf) {
      sql += " AND d.shelf_id = ?";
      params.push(shelf.id);
    }

    sql += tagFilter.clause;
    params.push(...tagFilter.params);
    sql += " ORDER BY d.title LIMIT ?";
    params.push(limit);

    rows = await allQuery(sql, params);
  }

  if (includeTags) {
    rows = await attachTagsToRows(rows);
  }

  return rows.map((row) => ({
    ...row,
    uri: buildDocumentUri(row.id),
    shelf_uri: buildShelfUri(row.shelf_id, row.shelf_name)
  }));
}

async function listDocuments(args) {
  const includeTags = args.include_tags === true;
  const includeShelfName = !args.shelf;
  const shelf = args.shelf ? await getShelfByName(args.shelf) : null;

  if (args.tag && args.tagged === false) {
    throw new Error("I filtri tag e tagged=false non sono compatibili.");
  }

  let sql = "SELECT d.id, d.title, d.file_path, d.size_bytes, s.id AS shelf_id, s.name AS shelf_name";
  sql += " FROM documents d JOIN shelves s ON s.id = d.shelf_id WHERE 1 = 1";

  const params = [];
  if (shelf) {
    sql += " AND d.shelf_id = ?";
    params.push(shelf.id);
  }

  if (!isBlank(args.tag)) {
    sql += `
      AND EXISTS (
        SELECT 1
        FROM document_tags dt
        JOIN tags t ON t.id = dt.tag_id
        WHERE dt.document_id = d.id AND t.name = ?
      )`;
    params.push(args.tag.trim());
  }

  if (args.tagged === true) {
    sql += " AND EXISTS (SELECT 1 FROM document_tags dt WHERE dt.document_id = d.id)";
  } else if (args.tagged === false) {
    sql += " AND NOT EXISTS (SELECT 1 FROM document_tags dt WHERE dt.document_id = d.id)";
  }

  sql += " ORDER BY d.title";
  let rows = await allQuery(sql, params);

  if (includeTags) {
    rows = await attachTagsToRows(rows);
  }

  return rows.map((row) => {
    const baseRow = {
      id: row.id,
      title: row.title,
      file_path: row.file_path,
      size_bytes: row.size_bytes,
      shelf_id: row.shelf_id,
      uri: buildDocumentUri(row.id),
      shelf_uri: buildShelfUri(row.shelf_id, row.shelf_name)
    };

    if (includeShelfName) baseRow.shelf_name = row.shelf_name;
    if (includeTags && row.tags) baseRow.tags = row.tags;
    return baseRow;
  });
}

async function collectFeatureStatus() {
  const states = {};
  for (const featureKey of Object.keys(KNOWN_FEATURES)) {
    const state = await ensureFeatureStateRow(featureKey);
    states[featureKey] = {
      feature_key: featureKey,
      notice_shown_at: state.notice_shown_at,
      initialized_at: state.initialized_at,
      is_initialized: Boolean(state.initialized_at),
      status: safeParseJson(state.status_json)
    };
  }

  const tagStats = await getQuery(
    `SELECT
       (SELECT COUNT(*) FROM tags) AS tag_count,
       (SELECT COUNT(DISTINCT document_id) FROM document_tags) AS tagged_document_count`
  );
  states.tags.tag_count = tagStats.tag_count;
  states.tags.tagged_document_count = tagStats.tagged_document_count;
  if (!states.tags.is_initialized) {
    states.tags.recommended_next_steps = [
      "Use docs_management create_tag to define the dictionary.",
      "Use docs_navigation list_documents or docs_management list_shelves to review the current corpus.",
      "Use docs_management bulk_set_document_tags for the first massive classification pass."
    ];
  }

  const sourceStats = await getScanSourceCounts();
  states.scan_sources.source_count = sourceStats.source_count;
  states.scan_sources.folder_source_count = sourceStats.folder_source_count;
  states.scan_sources.file_source_count = sourceStats.file_source_count;
  states.scan_sources.is_legacy_file_backfill_only = isScanSourcesLegacyOnly(sourceStats);
  if (states.scan_sources.is_legacy_file_backfill_only) {
    states.scan_sources.initialization_mode = "legacy-file-backfill";
    states.scan_sources.recommended_next_steps = [
      "Run docs_management scan_folder on each real documentation root.",
      "This will register folder sources and allow automatic discovery of new markdown files during resync_all."
    ];
  } else {
    states.scan_sources.initialization_mode = sourceStats.folder_source_count > 0 ? "folder-aware" : "empty";
  }

  return states;
}

async function backfillLegacyScanSources() {
  const legacyDocuments = await allQuery(
    `SELECT d.id, d.shelf_id, d.file_path
     FROM documents d
     LEFT JOIN scan_sources ss ON ss.id = d.source_id
     WHERE d.source_id IS NULL OR ss.id IS NULL`
  );

  let linkedDocuments = 0;
  for (const document of legacyDocuments) {
    const source = await ensureScanSource("file", document.file_path, document.shelf_id, false);
    await runQuery("UPDATE documents SET source_id = ? WHERE id = ?", [source.id, document.id]);
    linkedDocuments += 1;
  }

  const totalSourcesRow = await getQuery("SELECT COUNT(*) AS total_sources FROM scan_sources");
  const mergedStatus = {
    backfilled_documents: linkedDocuments,
    total_sources: totalSourcesRow.total_sources || 0
  };

  await updateFeatureState("scan_sources", {
    initialized: true,
    statusJson: mergedStatus
  });
}

async function refreshScanSourcesFeatureState() {
  const sourceStats = await getScanSourceCounts();
  await updateFeatureState("scan_sources", {
    initialized: true,
    statusJson: {
      initialization_mode: isScanSourcesLegacyOnly(sourceStats) ? "legacy-file-backfill" : "folder-aware",
      ...sourceStats
    }
  });
}

async function refreshTagsFeatureState() {
  const tagStats = await getQuery(
    `SELECT
       (SELECT COUNT(*) FROM tags) AS tag_count,
       (SELECT COUNT(DISTINCT document_id) FROM document_tags) AS tagged_document_count`
  );

  await updateFeatureState("tags", {
    initialized: true,
    statusJson: {
      initialized_via: "runtime-refresh",
      tag_count: tagStats.tag_count || 0,
      tagged_document_count: tagStats.tagged_document_count || 0
    }
  });
}

async function initDb() {
  await runQuery("PRAGMA journal_mode = WAL");
  await runQuery("PRAGMA foreign_keys = ON");

  await runQuery(`
    CREATE TABLE IF NOT EXISTS shelves (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      shelf_id    INTEGER NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
      file_path   TEXT NOT NULL,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      size_bytes  INTEGER DEFAULT 0,
      scanned_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(shelf_id, file_path)
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
      description TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS document_tags (
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (document_id, tag_id)
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS scan_sources (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      shelf_id    INTEGER NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK(source_type IN ('file', 'folder')),
      source_path TEXT NOT NULL,
      recursive   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now')),
      UNIQUE(shelf_id, source_type, source_path, recursive)
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS feature_state (
      feature_key     TEXT PRIMARY KEY,
      notice_shown_at TEXT,
      initialized_at  TEXT,
      status_json     TEXT,
      updated_at      TEXT DEFAULT (datetime('now'))
    )
  `);

  if (!(await columnExists("documents", "source_id"))) {
    await runQuery("ALTER TABLE documents ADD COLUMN source_id INTEGER");
  }

  await runQuery("CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id)");
  await runQuery("CREATE INDEX IF NOT EXISTS idx_documents_shelf_id ON documents(shelf_id)");
  await runQuery("CREATE INDEX IF NOT EXISTS idx_document_tags_tag_id ON document_tags(tag_id)");
  await runQuery("CREATE INDEX IF NOT EXISTS idx_scan_sources_shelf_id ON scan_sources(shelf_id)");
  await runQuery("CREATE INDEX IF NOT EXISTS idx_scan_sources_source_path ON scan_sources(source_path)");

  try {
    await runQuery(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title,
        content,
        content='documents',
        content_rowid='id',
        tokenize='unicode61'
      )
    `);
    await runQuery(`
      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
      END
    `);
    await runQuery(`
      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
      END
    `);
    await runQuery(`
      CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content)
        VALUES ('delete', old.id, old.title, old.content);
        INSERT INTO documents_fts(rowid, title, content)
        VALUES (new.id, new.title, new.content);
      END
    `);
    hasFTS5 = true;
  } catch (error) {
    if (error.message.includes("no such module: fts5") || error.message.includes("fts5")) {
      console.error("FTS5 non supportato in questa build di sqlite3. Verra usato LIKE per la ricerca.");
      hasFTS5 = false;
    } else {
      throw error;
    }
  }

  for (const featureKey of Object.keys(KNOWN_FEATURES)) {
    await ensureFeatureStateRow(featureKey);
  }

  await backfillLegacyScanSources();
}

const server = new Server(
  { name: "docs-mcp-server", version: "1.1.0" },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    const shelves = await allQuery(
      `SELECT s.id, s.name, s.description, COUNT(d.id) AS document_count
       FROM shelves s
       LEFT JOIN documents d ON d.shelf_id = s.id
       GROUP BY s.id
       ORDER BY s.name`
    );
    const documents = await allQuery(
      `SELECT d.id, d.title, d.file_path, s.name AS shelf_name
       FROM documents d
       JOIN shelves s ON s.id = d.shelf_id
       ORDER BY s.name, d.title`
    );

    const resources = [
      ...shelves.map((shelf) => ({
        uri: buildShelfUri(shelf.id, shelf.name),
        name: `Shelf: ${shelf.name}`,
        description: `${shelf.description || "Scaffale documentazione"} (documenti: ${shelf.document_count})`,
        mimeType: "application/json"
      })),
      ...documents.map((document) => ({
        uri: buildDocumentUri(document.id),
        name: `Document: ${document.title}`,
        description: `${document.shelf_name} · ${document.file_path}`,
        mimeType: "text/markdown"
      }))
    ];

    return { resources };
  } catch (error) {
    return responseFromBlocks([`[ERROR] ${error.message}`], true);
  }
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    const parsed = parseDocsUri(uri);

    if (parsed.type === "shelf") {
      const shelf = await getShelfById(parsed.shelfId);
      const documents = await allQuery(
        `SELECT d.id, d.title, d.file_path, d.updated_at
         FROM documents d
         WHERE d.shelf_id = ?
         ORDER BY d.title`,
        [shelf.id]
      );
      const documentsWithUri = documents.map((document) => ({
        ...document,
        uri: buildDocumentUri(document.id)
      }));

      return {
        contents: [{
          uri: buildShelfUri(shelf.id, shelf.name),
          mimeType: "application/json",
          text: jsonText({
            shelf_id: shelf.id,
            shelf: shelf.name,
            uri: buildShelfUri(shelf.id, shelf.name),
            description: shelf.description,
            document_count: documentsWithUri.length,
            documents: documentsWithUri
          })
        }]
      };
    }

    const document = await ensureDocumentExists(parsed.documentId);
    return {
      contents: [{
        uri: buildDocumentUri(document.id),
        mimeType: "text/markdown",
        text: document.content
      }]
    };
  } catch (error) {
    return responseFromBlocks([`[ERROR] ${error.message}`], true);
  }
});

server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  try {
    return {
      resourceTemplates: [
        {
          uriTemplate: "docs://shelf/{shelf_id}-{shelf_slug}",
          name: "Shelf documents",
          description: "Lista documenti per scaffale (parametri: shelf_id obbligatorio, shelf_slug opzionale informativa).",
          mimeType: "application/json"
        },
        {
          uriTemplate: "docs://document/{document_id}",
          name: "Document content",
          description: "Contenuto markdown del documento (parametro: document_id).",
          mimeType: "text/markdown"
        }
      ]
    };
  } catch (error) {
    return responseFromBlocks([`[ERROR] ${error.message}`], true);
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "docs_management",
      description: "Gestisce indicizzazione, scaffali, dizionario tag, stato feature e resync della documentazione.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "scan_file",
              "scan_folder",
              "list_shelves",
              "create_shelf",
              "update_shelf",
              "remove_shelf",
              "list_tags",
              "create_tag",
              "update_tag",
              "remove_tag",
              "set_document_tags",
              "bulk_set_document_tags",
              "resync_all",
              "feature_status",
              "remove_document"
            ],
            description: "Operazione di gestione documentazione, scaffali, tag e resync."
          },
          file_path: { type: "string" },
          folder_path: { type: "string" },
          shelf: { type: "string", description: "Nome dello scaffale." },
          recursive: { type: "boolean", default: true },
          name: { type: "string", description: "Nome entita per create/update/remove." },
          description: { type: "string", description: "Descrizione entita." },
          new_name: { type: "string" },
          new_description: { type: "string" },
          document_id: { type: "number" },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Lista tag per set_document_tags o filtri di ricerca."
          },
          assignments: {
            type: "array",
            description: "Lista assegnazioni massive { document_id, tags[] }.",
            items: {
              type: "object",
              properties: {
                document_id: { type: "number" },
                tags: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["document_id", "tags"]
            }
          }
        },
        required: ["action"]
      }
    },
    {
      name: "docs_navigation",
      description: "Ricerca e lettura della documentazione indicizzata, con filtri opzionali per tag.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["search", "read_document", "list_documents"],
            description: "Operazione: search, read_document, list_documents."
          },
          query: { type: "string", description: "Termine di ricerca full-text." },
          shelf: { type: "string", description: "Filtro scaffale opzionale." },
          document_id: { type: "number" },
          limit: { type: "number", default: 10 },
          start_line: { type: "number" },
          end_line: { type: "number" },
          search_string: { type: "string" },
          context_lines: { type: "number", default: 10 },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filtro opzionale per tag."
          },
          tag_match: {
            type: "string",
            enum: ["all", "any"],
            description: "Con tags, richiede tutti i tag o almeno uno."
          },
          include_tags: { type: "boolean", description: "Include i tag assegnati nei risultati." },
          tag: { type: "string", description: "Filtro singolo per list_documents." },
          tagged: { type: "boolean", description: "Filtro documenti taggati o non taggati." }
        },
        required: ["action"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs || {};

  try {
    if (name === "docs_management") {
      switch (args.action) {
        case "scan_file": {
          const filePath = normalizePathValue(requireNonEmptyString(args.file_path, "file_path"));
          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            throw new Error(`File non trovato: ${filePath}`);
          }

          const shelf = await ensureShelf(args.shelf);
          const source = await ensureScanSource("file", filePath, shelf.id, false);
          const result = await syncMarkdownFile({ shelfId: shelf.id, filePath, sourceId: source.id });
          return responseFromBlocks([
            `[OK] File ${result.action}: "${path.basename(filePath)}" -> scaffale "${shelf.name}".`
          ]);
        }

        case "scan_folder": {
          const folderPath = normalizePathValue(requireNonEmptyString(args.folder_path, "folder_path"));
          if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
            throw new Error(`Cartella non trovata: ${folderPath}`);
          }

          const recursive = normalizeBoolean(args.recursive, true);
          const shelf = await ensureShelf(args.shelf);
          const source = await ensureScanSource("folder", folderPath, shelf.id, recursive);
          const files = findMarkdownFiles(folderPath, recursive);

          if (files.length === 0) {
            return responseFromBlocks([
              `[WARN] Nessun file .md trovato. La sorgente di scansione e stata comunque registrata per lo scaffale "${shelf.name}".`
            ]);
          }

          const result = { inserted: 0, updated: 0, errors: [] };
          await runQuery("BEGIN TRANSACTION");
          try {
            for (const file of files) {
              try {
                const syncResult = await syncMarkdownFile({
                  shelfId: shelf.id,
                  filePath: file,
                  sourceId: source.id
                });
                result[syncResult.action] += 1;
              } catch (error) {
                result.errors.push({ file, error: error.message });
              }
            }
            await runQuery("COMMIT");
          } catch (error) {
            await runQuery("ROLLBACK");
            throw error;
          }

          const summary = `[OK] Scansione completata. Scaffale "${shelf.name}": Inseriti: ${result.inserted} | Aggiornati: ${result.updated}${result.errors.length > 0 ? ` | Errori: ${result.errors.length}` : ""}`;
          await refreshScanSourcesFeatureState();
          return responseFromBlocks([summary]);
        }

        case "list_shelves": {
          const shelves = await allQuery(
            `SELECT s.id AS shelf_id, s.name, s.description, COUNT(d.id) AS document_count
             FROM shelves s
             LEFT JOIN documents d ON d.shelf_id = s.id
             GROUP BY s.id
             ORDER BY s.name`
          );
          const shelvesWithUri = shelves.map((shelf) => ({
            ...shelf,
            uri: buildShelfUri(shelf.shelf_id, shelf.name)
          }));
          return responseFromBlocks([jsonText(shelvesWithUri)]);
        }

        case "create_shelf": {
          const shelfName = requireNonEmptyString(args.name, "name");
          const existing = await getQuery("SELECT id FROM shelves WHERE name = ?", [shelfName]);
          if (existing) throw new Error(`Lo scaffale "${shelfName}" esiste gia.`);

          await runQuery(
            "INSERT INTO shelves (name, description) VALUES (?, ?)",
            [shelfName, args.description || ""]
          );
          return responseFromBlocks([`[OK] Scaffale "${shelfName}" creato.`]);
        }

        case "update_shelf": {
          const shelf = await getShelfByName(args.shelf);
          const nextName = args.new_name ? requireNonEmptyString(args.new_name, "new_name") : shelf.name;
          const nextDescription = args.new_description !== undefined ? args.new_description : shelf.description;
          await runQuery(
            "UPDATE shelves SET name = ?, description = ? WHERE id = ?",
            [nextName, nextDescription, shelf.id]
          );
          return responseFromBlocks([
            `[OK] Scaffale aggiornato: "${shelf.name}" -> "${nextName}".`
          ]);
        }

        case "remove_shelf": {
          const shelf = await getShelfByName(args.shelf);
          await runQuery("DELETE FROM documents WHERE shelf_id = ?", [shelf.id]);
          await runQuery("DELETE FROM shelves WHERE id = ?", [shelf.id]);
          await refreshScanSourcesFeatureState();
          await refreshTagsFeatureState();
          return responseFromBlocks([`[OK] Scaffale "${shelf.name}" rimosso.`]);
        }

        case "list_tags": {
          const notice = await consumeFeatureNotice("tags");
          const tags = await allQuery(
            `SELECT t.name, t.description, COUNT(dt.document_id) AS document_count
             FROM tags t
             LEFT JOIN document_tags dt ON dt.tag_id = t.id
             GROUP BY t.id
             ORDER BY t.name`
          );
          return responseFromBlocks([notice, jsonText(tags)]);
        }

        case "create_tag": {
          const notice = await consumeFeatureNotice("tags");
          const tagName = requireNonEmptyString(args.name, "name");
          const description = requireNonEmptyString(args.description, "description");
          const existing = await getQuery("SELECT id FROM tags WHERE name = ?", [tagName]);
          if (existing) throw new Error(`Il tag "${tagName}" esiste gia.`);

          await runQuery(
            `INSERT INTO tags (name, description, updated_at)
             VALUES (?, ?, datetime('now'))`,
            [tagName, description]
          );
          return responseFromBlocks([notice, `[OK] Tag "${tagName}" creato.`]);
        }

        case "update_tag": {
          const notice = await consumeFeatureNotice("tags");
          const tagName = requireNonEmptyString(args.name, "name");
          const tag = await getQuery("SELECT * FROM tags WHERE name = ?", [tagName]);
          if (!tag) throw new Error(`Tag non trovato: ${tagName}`);

          const nextName = args.new_name ? requireNonEmptyString(args.new_name, "new_name") : tag.name;
          const nextDescription = args.new_description !== undefined
            ? requireNonEmptyString(args.new_description, "new_description")
            : tag.description;

          await runQuery(
            `UPDATE tags
             SET name = ?, description = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [nextName, nextDescription, tag.id]
          );
          return responseFromBlocks([notice, `[OK] Tag aggiornato: "${tag.name}" -> "${nextName}".`]);
        }

        case "remove_tag": {
          const notice = await consumeFeatureNotice("tags");
          const tagName = requireNonEmptyString(args.name, "name");
          const tag = await getQuery("SELECT id FROM tags WHERE name = ?", [tagName]);
          if (!tag) throw new Error(`Tag non trovato: ${tagName}`);

          await runQuery("DELETE FROM tags WHERE id = ?", [tag.id]);
          return responseFromBlocks([notice, `[OK] Tag "${tagName}" rimosso.`]);
        }

        case "set_document_tags": {
          const notice = await consumeFeatureNotice("tags");
          const document = await ensureDocumentExists(args.document_id);
          const tagNames = normalizeTagNames(args.tags || []);
          await replaceDocumentTags(document.id, tagNames);
          return responseFromBlocks([
            notice,
            `[OK] Tag aggiornati per il documento ${document.id} (${document.title}). Conteggio tag: ${tagNames.length}.`
          ]);
        }

        case "bulk_set_document_tags": {
          const notice = await consumeFeatureNotice("tags");
          if (!Array.isArray(args.assignments) || args.assignments.length === 0) {
            throw new Error("assignments deve essere un array non vuoto.");
          }

          const normalizedAssignments = [];
          const uniqueTags = new Map();
          for (const assignment of args.assignments) {
            if (!assignment || typeof assignment !== "object") {
              throw new Error("Ogni assignment deve essere un oggetto { document_id, tags }.");
            }
            const document = await ensureDocumentExists(assignment.document_id);
            const tagNames = normalizeTagNames(assignment.tags || []);
            normalizedAssignments.push({ document, tagNames });
            for (const tagName of tagNames) {
              uniqueTags.set(tagName.toLowerCase(), tagName);
            }
          }

          await validateKnownTags([...uniqueTags.values()]);
          await runQuery("BEGIN TRANSACTION");
          try {
            for (const assignment of normalizedAssignments) {
              const tagRows = await validateKnownTags(assignment.tagNames);
              await runQuery("DELETE FROM document_tags WHERE document_id = ?", [assignment.document.id]);
              for (const tagRow of tagRows) {
                await runQuery(
                  "INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)",
                  [assignment.document.id, tagRow.id]
                );
              }
            }
            await runQuery("COMMIT");
          } catch (error) {
            await runQuery("ROLLBACK");
            throw error;
          }

          await updateFeatureState("tags", {
            initialized: true,
            statusJson: {
              initialized_via: "bulk_set_document_tags",
              last_bulk_assignment_count: normalizedAssignments.length
            }
          });

          return responseFromBlocks([
            notice,
            `[OK] Classificazione massiva completata. Documenti aggiornati: ${normalizedAssignments.length}.`
          ]);
        }

        case "feature_status": {
          const status = await collectFeatureStatus();
          return responseFromBlocks([jsonText(status)]);
        }

        case "resync_all": {
          const notice = await consumeScanSourcesLegacyNoticeIfNeeded();
          const sources = await allQuery(
            `SELECT ss.*, s.name AS shelf_name
             FROM scan_sources ss
             JOIN shelves s ON s.id = ss.shelf_id
             ORDER BY CASE ss.source_type WHEN 'folder' THEN 0 ELSE 1 END, ss.source_path`
          );

          const folderSourcesByShelf = new Map();
          for (const source of sources) {
            if (source.source_type !== "folder") continue;
            if (!folderSourcesByShelf.has(source.shelf_id)) {
              folderSourcesByShelf.set(source.shelf_id, []);
            }
            folderSourcesByShelf.get(source.shelf_id).push(source);
          }

          const report = {
            inserted: 0,
            updated: 0,
            missing_files: [],
            source_errors: []
          };

          for (const source of sources) {
            if (source.source_type === "folder") {
              try {
                if (!fs.existsSync(source.source_path) || !fs.statSync(source.source_path).isDirectory()) {
                  report.source_errors.push({
                    source_id: source.id,
                    source_type: source.source_type,
                    source_path: source.source_path,
                    shelf: source.shelf_name,
                    error: "Cartella non trovata o non accessibile."
                  });
                  continue;
                }

                const files = findMarkdownFiles(source.source_path, source.recursive === 1);
                const fileKeys = new Set(files.map((file) => comparePathKey(file)));

                await runQuery("BEGIN TRANSACTION");
                try {
                  for (const file of files) {
                    try {
                      const syncResult = await syncMarkdownFile({
                        shelfId: source.shelf_id,
                        filePath: file,
                        sourceId: source.id
                      });
                      report[syncResult.action] += 1;
                    } catch (error) {
                      report.source_errors.push({
                        source_id: source.id,
                        source_type: source.source_type,
                        source_path: source.source_path,
                        shelf: source.shelf_name,
                        file_path: file,
                        error: error.message
                      });
                    }
                  }
                  await runQuery("COMMIT");
                } catch (error) {
                  await runQuery("ROLLBACK");
                  throw error;
                }

                const currentDocuments = await allQuery(
                  `SELECT d.id, d.title, d.file_path
                   FROM documents d
                   WHERE d.source_id = ?`,
                  [source.id]
                );

                for (const document of currentDocuments) {
                  if (!fileKeys.has(comparePathKey(document.file_path))) {
                    report.missing_files.push({
                      document_id: document.id,
                      title: document.title,
                      old_file_path: document.file_path,
                      shelf: source.shelf_name,
                      source_type: source.source_type
                    });
                  }
                }
              } catch (error) {
                report.source_errors.push({
                  source_id: source.id,
                  source_type: source.source_type,
                  source_path: source.source_path,
                  shelf: source.shelf_name,
                  error: error.message
                });
              }
              continue;
            }

            const coveringFolderSources = (folderSourcesByShelf.get(source.shelf_id) || []).filter((folderSource) =>
              isFileCoveredByFolderSource(source.source_path, folderSource.source_path, folderSource.recursive === 1)
            );
            if (coveringFolderSources.length > 0) {
              continue;
            }

            try {
              if (!fs.existsSync(source.source_path) || !fs.statSync(source.source_path).isFile()) {
                const document = await getQuery(
                  `SELECT d.id, d.title
                   FROM documents d
                   WHERE d.source_id = ?`,
                  [source.id]
                );
                if (document) {
                  report.missing_files.push({
                    document_id: document.id,
                    title: document.title,
                    old_file_path: source.source_path,
                    shelf: source.shelf_name,
                    source_type: source.source_type
                  });
                } else {
                  report.source_errors.push({
                    source_id: source.id,
                    source_type: source.source_type,
                    source_path: source.source_path,
                    shelf: source.shelf_name,
                    error: "File non trovato e nessun documento collegato alla sorgente."
                  });
                }
                continue;
              }

              const syncResult = await syncMarkdownFile({
                shelfId: source.shelf_id,
                filePath: source.source_path,
                sourceId: source.id
              });
              report[syncResult.action] += 1;
            } catch (error) {
              report.source_errors.push({
                source_id: source.id,
                source_type: source.source_type,
                source_path: source.source_path,
                shelf: source.shelf_name,
                error: error.message
              });
            }
          }

          report.guidance = report.missing_files.length > 0
            ? "Alcuni file indicizzati non sono piu presenti. Chiedere all'utente se fornire un nuovo percorso o procedere con la rimozione tramite docs_management remove_document."
            : "Nessun file mancante rilevato.";

          return responseFromBlocks([notice, jsonText(report)]);
        }

        case "remove_document": {
          const document = await ensureDocumentExists(args.document_id);
          await runQuery("DELETE FROM documents WHERE id = ?", [document.id]);

          if (document.source_id) {
            const source = await getQuery("SELECT * FROM scan_sources WHERE id = ?", [document.source_id]);
            const linkedDocument = await getQuery(
              "SELECT id FROM documents WHERE source_id = ? LIMIT 1",
              [document.source_id]
            );
            if (source && source.source_type === "file" && !linkedDocument) {
              await runQuery("DELETE FROM scan_sources WHERE id = ?", [document.source_id]);
            }
          }

          await refreshScanSourcesFeatureState();
          await refreshTagsFeatureState();

          return responseFromBlocks([
            `[OK] Documento ${document.id} (${document.title}) rimosso dall'indice.`
          ]);
        }

        default:
          throw new Error(`Azione non valida per docs_management: ${args.action}`);
      }
    }

    if (name === "docs_navigation") {
      switch (args.action) {
        case "search": {
          const shouldNoticeTags = (
            (Array.isArray(args.tags) && args.tags.length > 0) ||
            args.include_tags === true
          );
          const notice = shouldNoticeTags ? await consumeFeatureNotice("tags") : null;
          const rows = await searchDocuments(args);
          if (rows.length === 0) {
            return responseFromBlocks([notice, "Nessun risultato."]);
          }
          return responseFromBlocks([notice, jsonText(rows)]);
        }

        case "read_document": {
          const notice = args.include_tags === true ? await consumeFeatureNotice("tags") : null;
          const document = await ensureDocumentExists(args.document_id);

          let output = document.content;
          const lines = output.split(/\r?\n/);
          if (!isBlank(args.search_string)) {
            const query = args.search_string.trim().toLowerCase();
            const contextLines = normalizeLimit(args.context_lines, 10);
            const blocks = [];

            for (let index = 0; index < lines.length; index += 1) {
              if (!lines[index].toLowerCase().includes(query)) continue;

              const start = Math.max(0, index - contextLines);
              const end = Math.min(lines.length, index + contextLines + 1);
              blocks.push(
                `--- Match at line ${index + 1} ---\n${lines
                  .slice(start, end)
                  .map((line, lineIndex) => `${start + lineIndex + 1}: ${line}`)
                  .join("\n")}`
              );
            }

            output = blocks.length > 0 ? blocks.join("\n\n") : `Nessun match per "${args.search_string}".`;
          } else if (args.start_line || args.end_line) {
            const start = args.start_line ? Math.max(1, Number(args.start_line)) - 1 : 0;
            const end = args.end_line ? Math.min(lines.length, Number(args.end_line)) : lines.length;
            output = lines
              .slice(start, end)
              .map((line, lineIndex) => `${start + lineIndex + 1}: ${line}`)
              .join("\n");
          }

          let header = `Doc: ${document.title} (${document.shelf_name})`;
          if (args.include_tags === true) {
            const tags = await getDocumentTags(document.id);
            header += `\nTags: ${tags.length > 0 ? tags.join(", ") : "(none)"}`;
          }

          return responseFromBlocks([notice, `${header}\n\n${output}`]);
        }

        case "list_documents": {
          const shouldNoticeTags = (
            args.include_tags === true ||
            args.tagged !== undefined ||
            !isBlank(args.tag)
          );
          const notice = shouldNoticeTags ? await consumeFeatureNotice("tags") : null;
          const documents = await listDocuments(args);
          return responseFromBlocks([notice, jsonText(documents)]);
        }

        default:
          throw new Error(`Azione non valida per docs_navigation: ${args.action}`);
      }
    }

    throw new Error(`Tool sconosciuto: ${name}`);
  } catch (error) {
    return responseFromBlocks([`[ERROR] ${error.message}`], true);
  }
});

async function main() {
  await initDb();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
