import mysql from "mysql2/promise";

export function buildConfig(env) {
  return {
    host: env.DB_SERVER,
    port: env.DB_PORT ? parseInt(env.DB_PORT) : 3306,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD
  };
}

export async function connect(config) {
  return await mysql.createConnection(config);
}

export async function query(conn, sqlText) {
  const [rows] = await conn.execute(sqlText);
  return { rows };
}

export async function queryParam(conn, sqlText, paramName, paramValue) {
  // mysql2 usa placeholder posizionale ?
  const adapted = sqlText.replace(new RegExp(`@${paramName}|:${paramName}`, 'g'), '?');
  const [rows] = await conn.execute(adapted, [paramValue]);
  return { rows };
}

export async function explain(conn, originalQuery) {
  const [rows] = await conn.execute(`EXPLAIN FORMAT=JSON ${originalQuery}`);
  if (!rows || rows.length === 0) return null;
  // MySQL restituisce il piano nella colonna EXPLAIN
  const planJson = rows[0].EXPLAIN || rows[0]['EXPLAIN FORMAT=JSON'] || JSON.stringify(rows[0]);
  return `🔍 EXECUTION PLAN (MySQL)\n\n${planJson}`;
}

export async function getTableSchema(conn, tableName) {
  const q = `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? ORDER BY ORDINAL_POSITION`;
  const [rows] = await conn.execute(q, [tableName]);
  return { rows };
}

export async function close(conn) {
  if (conn) await conn.end();
}
