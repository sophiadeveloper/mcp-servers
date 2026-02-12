import pg from "pg";

export function buildConfig(env) {
  return {
    host: env.DB_SERVER,
    port: env.DB_PORT ? parseInt(env.DB_PORT) : 5432,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD
  };
}

export async function connect(config) {
  const client = new pg.Client(config);
  await client.connect();
  return client;
}

export async function query(client, sqlText) {
  const result = await client.query(sqlText);
  return { rows: result.rows };
}

export async function queryParam(client, sqlText, paramName, paramValue) {
  // pg usa placeholder posizionale $1
  const adapted = sqlText.replace(new RegExp(`@${paramName}|:${paramName}`, 'g'), '$1');
  const result = await client.query(adapted, [paramValue]);
  return { rows: result.rows };
}

export async function explain(client, originalQuery) {
  const result = await client.query(`EXPLAIN (FORMAT JSON) ${originalQuery}`);
  if (!result.rows || result.rows.length === 0) return null;
  const plan = JSON.stringify(result.rows[0]['QUERY PLAN'] || result.rows, null, 2);
  return `🔍 EXECUTION PLAN (PostgreSQL)\n\n${plan}`;
}

export async function getTableSchema(client, tableName) {
  const q = `SELECT column_name AS "COLUMN_NAME", data_type AS "DATA_TYPE", character_maximum_length AS "CHARACTER_MAXIMUM_LENGTH", is_nullable AS "IS_NULLABLE", column_default AS "COLUMN_DEFAULT" FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`;
  const result = await client.query(q, [tableName]);
  return { rows: result.rows };
}

export async function close(client) {
  if (client) await client.end();
}
