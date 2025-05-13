const { shortenUrl, getLongUrl } = require('../services/urlService');
require('../utils/tracing');
const { trace, context } = require('@opentelemetry/api');

async function createShortUrl(req, res) {
  const tracer = trace.getTracer('url-shortener');
  const span = tracer.startSpan('create-short-url');
  
  try {
    const { longUrl } = req.body;
    
    // Set basic attributes
    span.setAttributes({
      'http.method': req.method,
      'http.route': '/api/urls',
      'url.original': longUrl,
      'request.id': req.headers['x-request-id'],
      'user.agent': req.get('user-agent'),
      'client.ip': req.ip
    });

    // URL validation span
    const validationSpan = tracer.startSpan('validate-url', { parent: span });
    if (!longUrl || !/^https?:\/\//.test(longUrl)) {
      validationSpan.setAttributes({
        'error.type': 'validation_error',
        'error.message': 'Invalid URL format'
      });
      validationSpan.end();
      return res.status(400).json({ error: 'Invalid URL' });
    }
    validationSpan.end();

    // Create short URL span
    const createSpan = tracer.startSpan('create-short-url-operation', { parent: span });
    const shortUrl = await shortenUrl(longUrl, null);
    createSpan.setAttributes({
      'url.short_id': shortUrl.split('/').pop(),
      'url.short_url': shortUrl
    });
    createSpan.end();

    span.setAttributes({
      'http.status_code': 201,
      'url.short_id': shortUrl.split('/').pop()
    });
    
    res.status(201).json({ shortUrl });
  } catch (err) {
    span.setAttributes({
      'error.type': err.name,
      'error.message': err.message,
      'http.status_code': 500
    });
    span.recordException(err);
    res.status(500).json({ error: err.message });
  } finally {
    span.end();
  }
}

async function redirectToLongUrl(req, res) {
  const tracer = trace.getTracer('url-shortener');
  const span = tracer.startSpan('redirect-long-url');
  
  try {
    const { shortUrlId } = req.params;
    
    // Set basic attributes
    span.setAttributes({
      'http.method': req.method,
      'http.route': '/api/urls/:shortUrlId',
      'url.short_id': shortUrlId,
      'request.id': req.headers['x-request-id'],
      'user.agent': req.get('user-agent'),
      'client.ip': req.ip
    });

    // Cache check span
    const cacheSpan = tracer.startSpan('cache-lookup', { parent: span });
    const longUrl = await getLongUrl(shortUrlId);
    cacheSpan.setAttributes({
      'cache.hit': longUrl ? true : false
    });
    cacheSpan.end();

    span.setAttributes({
      'http.status_code': 301,
      'url.redirect_to': longUrl
    });
    
    res.redirect(301, longUrl);
  } catch (err) {
    span.setAttributes({
      'error.type': err.name,
      'error.message': err.message,
      'http.status_code': err.message === 'URL not found' ? 404 : 500
    });
    span.recordException(err);
    
    if (err.message === 'URL not found') {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    span.end();
  }
}

module.exports = { createShortUrl, redirectToLongUrl };