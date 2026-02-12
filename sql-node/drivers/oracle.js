import oracledb from "oracledb";

export function buildConfig(env) {
  const config = {
    user: env.DB_USER,
    password: env.DB_PASSWORD
  };

  // Supporta sia connectString esplicita che composizione da server/port/sid
  if (env.DB_CONNECT_STRING) {
    config.connectString = env.DB_CONNECT_STRING;
  } else {
    const host = env.DB_SERVER;
    const port = env.DB_PORT || '1521';
    const service = env.DB_SID || env.DB_NAME;
    config.connectString = `${host}:${port}/${service}`;
  }

  return config;
}

export async function connect(config) {
  return await oracledb.getConnection(config);
}

export async function query(conn, sqlText) {
  const result = await conn.execute(sqlText, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  return { rows: result.rows };
}

export async function queryParam(conn, sqlText, paramName, paramValue) {
  // Oracle usa bind :name
  const adapted = sqlText.replace(new RegExp(`@${paramName}`, 'g'), `:${paramName}`);
  const result = await conn.execute(adapted, { [paramName]: paramValue }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  return { rows: result.rows };
}

export async function explain(conn, originalQuery) {
  // Pulisce eventuali piani precedenti
  try { await conn.execute(`DELETE FROM PLAN_TABLE`); } catch (e) { /* ignora */ }

  await conn.execute(`EXPLAIN PLAN FOR ${originalQuery}`);
  const result = await conn.execute(
    `SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY('PLAN_TABLE', NULL, 'ALL'))`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (!result.rows || result.rows.length === 0) return null;
  const plan = result.rows.map(r => r.PLAN_TABLE_OUTPUT).join('\n');
  return `🔍 EXECUTION PLAN (Oracle)\n\n${plan}`;
}

export async function getTableSchema(conn, tableName) {
  const q = `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH AS "CHARACTER_MAXIMUM_LENGTH", NULLABLE AS "IS_NULLABLE", DATA_DEFAULT AS "COLUMN_DEFAULT" FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`;
  const result = await conn.execute(q, { t: tableName.toUpperCase() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
  return { rows: result.rows };
}

export async function close(conn) {
  if (conn) await conn.close();
}
