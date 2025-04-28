const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.pgConfig);


async function createUrl(shortUrlId, longUrl, userId) {
    const query = `
        INSERT INTO urls (short_url_id, long_url, user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (short_url_id) DO NOTHING
        RETURNING short_url_id
    `;

    const values = [shortUrlId, longUrl, userId || null];

    const res = await pool.query(query, values);
    if (!res.rows.length) throw new Error('Failed to create URL (possible conflict)');
    return res.rows[0].short_url_id;
}

async function getUrlByShortId(shortUrlId) {
    const query = 'SELECT long_url FROM urls WHERE short_url_id = $1';
    const res = await pool.query(query, [shortUrlId]);
    if (!res.rows.length) return null;
    return res.rows[0].long_url;
}

module.exports = {
    createUrl,
    getUrlByShortId,
};
