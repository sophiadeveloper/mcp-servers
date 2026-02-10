#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import sql from "mssql";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const server = new Server(
  { name: "sql-node-analyzer", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

function getDbConfig(projectPath) {
  let config = {
    server: "", database: "", user: "", password: "",
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  };

  if (!projectPath) throw new Error("Percorso progetto mancante.");

  const envPath = path.join(projectPath, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`File .env non trovato in: ${projectPath}.`);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  config.server = envConfig.DB_SERVER;
  config.database = envConfig.DB_NAME;
  config.user = envConfig.DB_USER;
  config.password = envConfig.DB_PASSWORD;

  if (envConfig.DB_INSTANCE) config.server = `${config.server}\\${envConfig.DB_INSTANCE}`;
  if (envConfig.DB_PORT) config.port = parseInt(envConfig.DB_PORT);

  if (!config.server || !config.user || !config.database) {
    throw new Error("Credenziali incomplete nel file .env.");
  }
  return config;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query_database",
        description: "Esegue query SELECT e restituisce i dati reali.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Query SQL (SELECT)" },
            project_path: { type: "string" }
          },
          required: ["query", "project_path"],
        },
      },
      {
        name: "explain_query",
        description: "Restituisce il PIANO DI ESECUZIONE stimato (Execution Plan) senza eseguire la query. Usa questo tool per analizzare le performance.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "La query SQL da analizzare" },
            project_path: { type: "string" }
          },
          required: ["query", "project_path"],
        },
      },
      {
        name: "get_table_schema",
        description: "Restituisce le colonne di una tabella.",
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string" },
            project_path: { type: "string" }
          },
          required: ["tableName", "project_path"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let pool;

  try {
    const dbConfig = getDbConfig(args.project_path);
    pool = await new sql.ConnectionPool(dbConfig).connect();

    // BLOCCO SICUREZZA COMUNE
    if (/INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|MERGE/i.test(args.query)) {
      return { content: [{ type: "text", text: "🚫 BLOCKED: Solo SELECT consentite per sicurezza." }], isError: true };
    }

    if (name === "query_database") {
      const result = await pool.request().query(args.query);
      return { content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }] };
    }

    if (name === "explain_query") {
      // Ricerca il piano nella cache di SQL Server usando le DMV

      // Crea una firma della query per la ricerca
      // Per query complesse, usiamo 100 caratteri + prendiamo i nomi delle tabelle principali
      const normalizedQuery = args.query.replace(/\s+/g, ' ').trim();
      const querySignature = normalizedQuery
        .substring(0, 100)
        .replace(/'/g, "''")
        .replace(/%/g, '[%]');

      // Estrai nomi di tabelle dalla query per una ricerca più precisa
      const tableMatches = args.query.match(/FROM\s+(\w+)|JOIN\s+(\w+)/gi) || [];
      const tables = tableMatches.slice(0, 2).join(' ').replace(/FROM|JOIN/gi, '').trim();

      // Query di ricerca: usa firma + nomi tabelle per query complesse
      const tableCondition = tables ? `AND st.text LIKE N'%${tables.split(' ')[0]}%'` : '';

      const planQuery = `
        SELECT TOP 1
          CAST(qp.query_plan AS NVARCHAR(MAX)) AS plan_xml,
          qs.execution_count,
          qs.total_elapsed_time / 1000 AS total_ms,
          qs.total_logical_reads AS logical_reads,
          SUBSTRING(st.text, 1, 300) AS query_preview
        FROM sys.dm_exec_query_stats qs
        CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
        CROSS APPLY sys.dm_exec_query_plan(qs.plan_handle) qp
        WHERE (st.text LIKE N'%${querySignature.substring(0, 60)}%' ${tableCondition})
          AND st.text NOT LIKE '%dm_exec_query%'
          AND qp.query_plan IS NOT NULL
        ORDER BY qs.last_execution_time DESC
      `;

      const result = await pool.request().query(planQuery);
      const rows = result.recordset || [];

      if (rows.length === 0 || !rows[0].plan_xml) {
        return {
          content: [{
            type: "text",
            text: `⚠️ Piano non trovato nella cache.\n\n` +
              `Per ottenere il piano, esegui prima la query con query_database, poi riprova.\n\n` +
              `Nota: I piani vengono rimossi dalla cache dopo un certo periodo o sotto pressione di memoria.`
          }]
        };
      }

      const row = rows[0];
      return {
        content: [{
          type: "text",
          text: `🔍 EXECUTION PLAN\n\n` +
            `📊 Stats: ${row.execution_count} exec, ${row.total_ms}ms, ${row.logical_reads} reads\n` +
            `📝 Query: ${row.query_preview}...\n\n` +
            row.plan_xml
        }]
      };
    }

    if (name === "get_table_schema") {
      const q = `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t`;
      const result = await pool.request().input('t', sql.VarChar, args.tableName).query(q);
      return { content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }] };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Errore SQL: ${err.message}` }], isError: true };
  } finally {
    if (pool) await pool.close();
  }
  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);