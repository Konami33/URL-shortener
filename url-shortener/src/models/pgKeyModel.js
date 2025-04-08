const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.pgConfig);

async function getUnusedKey() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      'SELECT short_url_id FROM keys WHERE used = FALSE LIMIT 1 FOR UPDATE'
    );
    if (!res.rows.length) throw new Error('No unused keys available');
    const key = res.rows[0].short_url_id;
    await client.query('UPDATE keys SET used = TRUE WHERE short_url_id = $1', [key]);
    await client.query('COMMIT');
    return key;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getUnusedKey };