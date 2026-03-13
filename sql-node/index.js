#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { Client } from "ssh2";

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

/**
 * Crea un tunnel SSH se configurato nel file .env.
 * Restituisce una Promise che risolve al client SSH e le info del tunnel locale.
 */
async function setupSshTunnel(envConfig) {
  if (!envConfig.SSH_HOST) return null;

  return new Promise((resolve, reject) => {
    const sshClient = new Client();
    
    sshClient.on('ready', () => {
      // Apriamo il tunnel verso il DB_SERVER:DB_PORT
      // Nota: lo facciamo "dinamicamente" sulla stessa porta se possibile o lasciamo che il driver si connetta a localhost:portaLocale
      // Per semplicità, molti driver supportano la connessione a socket o host/port.
      // Qui facciamo un forwarding semplice.
      resolve({ sshClient });
    }).on('error', (err) => {
      reject(new Error(`Errore SSH: ${err.message}`));
    });

    const connConfig = {
      host: envConfig.SSH_HOST,
      port: parseInt(envConfig.SSH_PORT || '22'),
      username: envConfig.SSH_USER
    };

    if (envConfig.SSH_KEY_PATH) {
      connConfig.privateKey = fs.readFileSync(envConfig.SSH_KEY_PATH);
    } else if (envConfig.SSH_PASSWORD) {
      connConfig.password = envConfig.SSH_PASSWORD;
    }

    sshClient.connect(connConfig);
  });
}

/**
 * Esegue il port forwarding per un driver specifico.
 */
async function forwardPort(sshClient, targetHost, targetPort) {
  return new Promise((resolve, reject) => {
    sshClient.forwardOut(
      '127.0.0.1', 0, // sorgente (non rilevante qui)
      targetHost, targetPort,
      (err, stream) => {
        if (err) reject(err);
        else resolve(stream);
      }
    );
  });
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
  let sshClient;

  try {
    const envConfig = readEnvConfig(args.project_path);
    driver = await getDriver(envConfig.DB_TYPE);
    let dbConfig = driver.buildConfig(envConfig);

    // GESTIONE TUNNEL SSH
    if (envConfig.SSH_HOST) {
      const sshSetup = await setupSshTunnel(envConfig);
      sshClient = sshSetup.sshClient;

      // Per MySQL e Postgres possiamo usare lo stream direttamente se il driver lo supporta,
      // oppure cambiare l'host in localhost e fargli usare un tunnel locale se lo creassimo con un listener.
      // Più semplice per questi drivers: molti accettano un parametro 'stream' o 'socketPath'.
      
      // Se il driver supporta la connessione tramite stream (es. mysql2 e pg), lo usiamo.
      // Altrimenti (mssql) dovremmo creare un local server (più complesso).
      
      // Limitiamo il supporto tunnel a MySQL e Postgres per ora se vogliamo usare lo stream, 
      // oppure modifichiamo il driver per accettare 'stream'.
      
      if (['mysql', 'postgres'].includes(envConfig.DB_TYPE.toLowerCase())) {
          const stream = await forwardPort(sshClient, dbConfig.host || envConfig.DB_SERVER, dbConfig.port || envConfig.DB_PORT);
          dbConfig.stream = stream;
      } else {
          // Per MSSQL/Oracle che non supportano stream facilmente in questo modo, 
          // avvisiamo che il tunnel non è ancora supportato per questo DB_TYPE o implementiamo un local listener.
          // Per ora lanciamo errore per chiarezza.
          throw new Error(`Il tunnel SSH è attualmente supportato solo per MySQL e PostgreSQL.`);
      }
    }

    conn = await driver.connect(dbConfig);

    // BLOCCO SICUREZZA COMUNE
    // Security: Use allowlist instead of blocklist. A blocklist is easily bypassed by
    // omitted keywords (CREATE, GRANT, REVOKE, LOAD DATA INFILE, COPY, INTO OUTFILE, CALL, SET, etc.).
    // Only permit queries that start with SELECT to enforce read-only access.
    if (args.query && !/^\s*SELECT\b/i.test(args.query)) {
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
    // @ts-ignore
    if (sshClient) sshClient.end();
  }
  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);