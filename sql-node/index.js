#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const SUPPORTED_DRIVERS = ["mssql", "mysql", "postgres", "oracle"];

const server = new Server(
  { name: "sql-mcp-server", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

/**
 * Carica dinamicamente il driver corretto in base al DB_TYPE.
 */
async function getDriver(dbType) {
  const type = (dbType || "").toLowerCase();
  if (!SUPPORTED_DRIVERS.includes(type)) {
    throw new Error(`DB_TYPE '${dbType}' non supportato. Usa uno tra: ${SUPPORTED_DRIVERS.join(", ")}`);
  }
  const driverModule = await import(`./drivers/${type}.js`);
  return driverModule;
}

/**
 * Legge la configurazione DB dal file .env del progetto.
 * Restituisce { dbType, config } dove config è già formattato dal driver.
 */
function readEnvConfig(projectPath) {
  if (!projectPath) throw new Error("Percorso progetto mancante.");

  const envPath = path.join(projectPath, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`File .env non trovato in: ${projectPath}.`);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath));

  if (!envConfig.DB_TYPE) {
    throw new Error("DB_TYPE non specificato nel file .env. Usa uno tra: " + SUPPORTED_DRIVERS.join(", "));
  }
  if (!envConfig.DB_SERVER || !envConfig.DB_USER || !envConfig.DB_NAME) {
    throw new Error("Credenziali incomplete nel file .env (servono almeno DB_SERVER, DB_USER, DB_NAME).");
  }

  return envConfig;
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
  let conn;
  let driver;

  try {
    const envConfig = readEnvConfig(args.project_path);
    driver = await getDriver(envConfig.DB_TYPE);
    const dbConfig = driver.buildConfig(envConfig);
    conn = await driver.connect(dbConfig);

    // BLOCCO SICUREZZA COMUNE
    if (args.query && /INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|MERGE/i.test(args.query)) {
      return { content: [{ type: "text", text: "🚫 BLOCKED: Solo SELECT consentite per sicurezza." }], isError: true };
    }

    if (name === "query_database") {
      const result = await driver.query(conn, args.query);
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    }

    if (name === "explain_query") {
      const planText = await driver.explain(conn, args.query);
      if (!planText) {
        return {
          content: [{
            type: "text",
            text: `⚠️ Piano non trovato.\n\n` +
              `Per ottenere il piano, esegui prima la query con query_database, poi riprova.\n\n` +
              `Nota: I piani vengono rimossi dalla cache dopo un certo periodo o sotto pressione di memoria.`
          }]
        };
      }
      return { content: [{ type: "text", text: planText }] };
    }

    if (name === "get_table_schema") {
      const result = await driver.getTableSchema(conn, args.tableName);
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Errore SQL: ${err.message}` }], isError: true };
  } finally {
    if (conn && driver) await driver.close(conn);
  }
  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);