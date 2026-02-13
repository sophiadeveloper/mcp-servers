import pkg from 'node-sql-parser';
const { Parser } = pkg;

const parser = new Parser();
const sql = "SELECT * FROM my_table WHERE id = 1";

try {
  const ast = parser.astify(sql, { database: 'TransactSQL' });
  console.log(JSON.stringify(ast, null, 2));
} catch (e) {
  console.error(e);
}
