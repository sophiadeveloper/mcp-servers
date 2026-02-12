import sql from "mssql";

export function buildConfig(env) {
  const config = {
    server: env.DB_SERVER,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true }
  };
  if (env.DB_INSTANCE) config.server = `${config.server}\\${env.DB_INSTANCE}`;
  if (env.DB_PORT) config.port = parseInt(env.DB_PORT);
  return config;
}

export async function connect(config) {
  return await new sql.ConnectionPool(config).connect();
}

export async function query(pool, sqlText) {
  const result = await pool.request().query(sqlText);
  return { rows: result.recordset };
}

export async function queryParam(pool, sqlText, paramName, paramValue) {
  const result = await pool.request().input(paramName, sql.VarChar, paramValue).query(sqlText);
  return { rows: result.recordset };
}

export async function explain(pool, originalQuery) {
  const normalizedQuery = originalQuery.replace(/\s+/g, ' ').trim();
  const querySignature = normalizedQuery
    .substring(0, 100)
    .replace(/'/g, "''")
    .replace(/%/g, '[%]');

  const tableMatches = originalQuery.match(/FROM\s+(\w+)|JOIN\s+(\w+)/gi) || [];
  const tables = tableMatches.slice(0, 2).join(' ').replace(/FROM|JOIN/gi, '').trim();
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
    return null; // segnala "piano non trovato"
  }

  const row = rows[0];
  return `🔍 EXECUTION PLAN\n\n` +
    `📊 Stats: ${row.execution_count} exec, ${row.total_ms}ms, ${row.logical_reads} reads\n` +
    `📝 Query: ${row.query_preview}...\n\n` +
    row.plan_xml;
}

export async function getTableSchema(pool, tableName) {
  const q = `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t ORDER BY ORDINAL_POSITION`;
  const result = await pool.request().input('t', sql.VarChar, tableName).query(q);
  return { rows: result.recordset };
}

export async function close(pool) {
  if (pool) await pool.close();
}
