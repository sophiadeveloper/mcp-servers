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

/**
 * Verifica che una query SQL sia di sola lettura (solo SELECT).
 * - Rimuove commenti SQL (blocco e riga) prima di controllare la prima parola chiave.
 * - Consente SELECT e WITH (CTE: WITH ... AS (...) SELECT ...).
 * - Blocca varianti SELECT con effetti collaterali: INTO OUTFILE/DUMPFILE (MySQL),
 *   SELECT INTO tabella (PostgreSQL/MSSQL).
 * - Blocca batch multi-istruzione (es. SELECT 1; DROP TABLE ...).
 */
function isQueryReadOnly(query) {
  if (!query) return false;

  // Rimuove commenti SQL in blocco (/* ... */) e di riga (-- ...) prima del controllo.
  // Nota: i commenti annidati (es. PostgreSQL /* /* ... */ */) non sono gestiti completamente;
  // in tal caso il blocco dell'accesso avviene ugualmente poiché il controllo sulla prima parola chiave fallirà.
  // Nota: la ricerca di INTO può bloccare query con la stringa 'into' in letterali — comportamento intenzionale
  // per sicurezza difensiva; usare un utente DB a sola lettura come misura complementare.
  const stripped = query
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .trim();

  // Consente inizialmente solo SELECT o WITH (per le CTE)
  if (!/^(SELECT|WITH)\b/i.test(stripped)) return false;

  // Sicurezza aggiuntiva per clausole WITH: blocca operazioni di modifica dati (INSERT/UPDATE/DELETE/etc)
  // che potrebbero essere nascoste all'interno di una CTE (es. WITH x AS (DELETE ...) SELECT * FROM x).
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|MERGE|EXEC|CALL|GRANT|REVOKE)\b/i.test(stripped)) {
    return false;
  }

  // Blocca SELECT con effetti collaterali: INTO OUTFILE/DUMPFILE/tabella
  if (/\bINTO\b/i.test(stripped)) return false;

  // Blocca batch multi-istruzione: rifiuta i punti e virgola non terminali
  const withoutTrailing = stripped.replace(/;\s*$/, '');
  if (/;/.test(withoutTrailing)) return false;

  return true;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "sql_executor",
        description: "Tool unificato per l'interazione con il database: esecuzione query, analisi del piano e ispezione schema.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["query", "explain", "schema"],
              description: "L'azione da eseguire: 'query' per eseguire una SELECT, 'explain' per vedere il piano di esecuzione, 'schema' per vedere le colonne di una tabella."
            },
            query: { type: "string", description: "La query SQL da eseguire o analizzare (necessaria per 'query' ed 'explain')." },
            tableName: { type: "string", description: "Nome della tabella di cui recuperare lo schema (necessario per 'schema')." },
            project_path: { type: "string", description: "Percorso root del progetto per trovare le credenziali nel file .env." }
          },
          required: ["action", "project_path"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name !== "sql_executor") {
      throw new Error(`Tool non trovato: ${name}`);
  }

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
      if (['mysql', 'postgres'].includes(envConfig.DB_TYPE.toLowerCase())) {
          const stream = await forwardPort(sshClient, dbConfig.host || envConfig.DB_SERVER, dbConfig.port || envConfig.DB_PORT);
          dbConfig.stream = stream;
      } else {
          throw new Error(`Il tunnel SSH è attualmente supportato solo per MySQL e PostgreSQL.`);
      }
    }

    conn = await driver.connect(dbConfig);

    // Azione: SCHEMA
    if (args.action === "schema") {
      if (!args.tableName) throw new Error("Parametro 'tableName' mancante per l'azione 'schema'.");
      const result = await driver.getTableSchema(conn, args.tableName);
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    }

    // Per query ed explain, validiamo la query
    if (!args.query) throw new Error(`Parametro 'query' mancante per l'azione '${args.action}'.`);
    
    // BLOCCO SICUREZZA COMUNE (Solo SELECT/WITH consentite)
    if (!isQueryReadOnly(args.query)) {
      return { content: [{ type: "text", text: "🚫 BLOCKED: Solo SELECT/WITH consentite per sicurezza." }], isError: true };
    }

    if (args.action === "query") {
      const result = await driver.query(conn, args.query);
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    }

    if (args.action === "explain") {
      const planText = await driver.explain(conn, args.query);
      if (!planText) {
        return {
          content: [{
            type: "text",
            text: `⚠️ Piano non trovato per la query specifica.`
          }]
        };
      }
      return { content: [{ type: "text", text: planText }] };
    }

  } catch (err) {
    return { content: [{ type: "text", text: `Errore SQL (${args.action || 'connect'}): ${err.message}` }], isError: true };
  } finally {
    if (conn && driver) await driver.close(conn);
    // @ts-ignore
    if (sshClient) sshClient.end();
  }
  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);