const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateKey(length = 7) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Pre-populate PostgreSQL with keys (run this separately)
async function prePopulateKeys(totalCount, batchSize = 10000) {
  const { Pool } = require('pg');
  const pool = new Pool(require('../config').pgConfig);
  const client = await pool.connect();
  
  try {
    for (let i = 0; i < totalCount; i += batchSize) {
      await client.query('BEGIN');
      for (let j = 0; j < batchSize; j++) {
        const key = generateKey();
        await client.query(
          'INSERT INTO keys (short_url_id, used) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [key, false]
        );
      }
      await client.query('COMMIT');
      console.log(`Inserted ${i + batchSize} keys...`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { generateKey, prePopulateKeys };