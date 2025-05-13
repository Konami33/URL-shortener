const { Pool } = require('pg');
const config = require('../config');
const { trace } = require('@opentelemetry/api');

const pool = new Pool(config.pgConfig);

async function createUrl(shortUrlId, longUrl, userId) {
    const tracer = trace.getTracer('database');
    const span = tracer.startSpan('create-url');
    
    try {
        span.setAttributes({
            'db.operation': 'INSERT',
            'db.table': 'urls',
            'url.short_id': shortUrlId,
            'url.original': longUrl,
            'user.id': userId || 'anonymous'
        });

        const query = `
            INSERT INTO urls (short_url_id, long_url, user_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (short_url_id) DO NOTHING
            RETURNING short_url_id
        `;

        const values = [shortUrlId, longUrl, userId || null];
        const startTime = Date.now();
        
        const res = await pool.query(query, values);
        
        span.setAttributes({
            'db.query.duration_ms': Date.now() - startTime,
            'db.rows_affected': res.rowCount
        });

        if (!res.rows.length) {
            span.setAttributes({
                'error.type': 'conflict',
                'error.message': 'Failed to create URL (possible conflict)'
            });
            throw new Error('Failed to create URL (possible conflict)');
        }
        
        return res.rows[0].short_url_id;
    } catch (err) {
        span.recordException(err);
        throw err;
    } finally {
        span.end();
    }
}

async function getUrlByShortId(shortUrlId) {
    const tracer = trace.getTracer('database');
    const span = tracer.startSpan('get-url-by-short-id');
    
    try {
        span.setAttributes({
            'db.operation': 'SELECT',
            'db.table': 'urls',
            'url.short_id': shortUrlId
        });

        const query = 'SELECT long_url FROM urls WHERE short_url_id = $1';
        const startTime = Date.now();
        
        const res = await pool.query(query, [shortUrlId]);
        
        span.setAttributes({
            'db.query.duration_ms': Date.now() - startTime,
            'db.rows_returned': res.rowCount,
            'cache.hit': false
        });

        if (!res.rows.length) {
            span.setAttributes({
                'error.type': 'not_found',
                'error.message': 'URL not found'
            });
            throw new Error('URL not found');
        }

        return res.rows[0].long_url;
    } catch (err) {
        span.recordException(err);
        throw err;
    } finally {
        span.end();
    }
}

module.exports = {
    createUrl,
    getUrlByShortId,
};
