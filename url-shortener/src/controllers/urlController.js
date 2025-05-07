// controllers/urlController.js
const { shortenUrl, getLongUrl } = require('../services/urlService');

async function createShortUrl(req, res) {
  try {
    const { longUrl } = req.body;
    if (!longUrl || !/^https?:\/\//.test(longUrl)) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    
    const shortUrl = await shortenUrl(longUrl, null); // userId optional
    
    // Track URL shortening operation
    req.app.locals.metrics.urlOperationsCounter.add(1, {
      operation: 'create',
      status: 'success'
    });
    
    res.status(201).json({ shortUrl });
  } catch (err) {
    // Track failed operation
    if (req.app && req.app.locals && req.app.locals.metrics) {
      req.app.locals.metrics.urlOperationsCounter.add(1, {
        operation: 'create',
        status: 'failure',
        error: err.name
      });
    }
    
    res.status(500).json({ error: err.message });
  }
}

async function redirectToLongUrl(req, res) {
  try {
    const { shortUrlId } = req.params;
    const longUrl = await getLongUrl(shortUrlId);
    
    // Track successful redirect
    req.app.locals.metrics.urlRedirectCounter.add(1, {
      status: 'success'
    });
    
    res.redirect(301, longUrl);
  } catch (err) {
    // Track redirect failures by error type
    if (req.app && req.app.locals && req.app.locals.metrics) {
      req.app.locals.metrics.urlRedirectCounter.add(1, {
        status: 'failure',
        error: err.message === 'URL not found' ? 'not_found' : 'server_error'
      });
    }
    
    if (err.message === 'URL not found') {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createShortUrl, redirectToLongUrl };