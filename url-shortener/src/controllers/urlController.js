const { shortenUrl, getLongUrl } = require('../services/urlService');
require('../utils/tracing');
const { trace } = require('@opentelemetry/api');

async function createShortUrl(req, res) {
  const span = trace.getTracer('url-shortener').startSpan('create-short-url');
  try {
    const { longUrl } = req.body;
    span.setAttribute('longurl', longUrl);
    if (!longUrl || !/^https?:\/\//.test(longUrl)) {
      span.setAttribute('ERROR', 'Invalid URL');
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const shortUrl = await shortenUrl(longUrl, null); // userId optional
    span.setAttribute('shorturl', shortUrl);
    res.status(201).json({ shortUrl });
  } catch (err) {
    span.recordException(err);
    res.status(500).json({ error: err.message });
  }  finally {
    span.end();
  }
}

async function redirectToLongUrl(req, res) {
  const span = trace.getTracer('url-shortener').startSpan('redirect-long-url');
  try {
    const { shortUrlId } = req.params;
    const longUrl = await getLongUrl(shortUrlId);
    span.setAttribute('longurl', longUrl);
    span.setAttribute('shorturlId', shortUrlId);
    res.redirect(301, longUrl);
  } catch (err) {
    span.recordException(err);
    if (err.message === 'URL not found') {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.status(500).json({ error: err.message });
  }  finally {
    span.end();
  }
}

module.exports = { createShortUrl, redirectToLongUrl };