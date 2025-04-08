const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateKey(length = 7) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Pre-populate PostgreSQL with keys (run this separately)
async function prePopulateKeys(count) {
  const { Pool } = require('pg');
  const config = require('../config');
  const pool = new Pool(config.pgConfig);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < count; i++) {
      const key = generateKey();
      await client.query('INSERT INTO keys (short_url_id, used) VALUES ($1, $2) ON CONFLICT DO NOTHING', [key, false]);
    }
    await client.query('COMMIT');
    console.log(`${count} keys populated`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { generateKey, prePopulateKeys };