const { Pool, types } = require('pg');

// node-pg returns NUMERIC/DECIMAL columns as strings by default; parse them as
// floats so the app can do normal arithmetic on quantities (OID 1700 = numeric).
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'gbu_cms',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  max: 10,
});

/**
 * Thin MySQL2-compatible shim over `pg`, so the rest of the app (written
 * against mysql2's `[rows]` / `[resultHeader]` return shape) needs no changes:
 *  - translates '?' placeholders to Postgres's '$1, $2, ...'
 *  - auto-appends 'RETURNING id' to INSERT statements so `result.insertId`
 *    works the same way mysql2's does
 *  - exposes getConnection()/beginTransaction()/commit()/rollback()/release()
 *    for the one transactional flow (inventory issue) that needs them
 */
function translate(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function isSelect(sql) {
  const t = sql.trim().toUpperCase();
  return t.startsWith('SELECT') || t.startsWith('WITH');
}

function needsReturning(sql) {
  const t = sql.trim().toUpperCase();
  return t.startsWith('INSERT') && !t.includes('RETURNING');
}

async function run(executor, sql, params = []) {
  let finalSql = translate(sql);
  if (needsReturning(finalSql)) finalSql += ' RETURNING id';
  const result = await executor(finalSql, params);
  if (isSelect(sql)) {
    return [result.rows];
  }
  return [{
    insertId: result.rows && result.rows[0] ? result.rows[0].id : undefined,
    affectedRows: result.rowCount,
  }];
}

const db = {
  query: (sql, params) => run((s, p) => pool.query(s, p), sql, params),

  async getConnection() {
    const client = await pool.connect();
    return {
      query: (sql, params) => run((s, p) => client.query(s, p), sql, params),
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release(),
    };
  },
};

module.exports = db;
