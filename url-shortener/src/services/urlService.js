// src/services/urlService.js
const redis = require('redis');
const config = require('../config');
const { createUrl, getUrlByShortId } = require('../models/pgUrlModel');
const { fetchUniqueKey } = require('./keyService');
const { trace } = require('@opentelemetry/api');
const { createCluster } = require('redis');

// Log the Redis nodes
console.log('Redis nodes:', config.redisConfig.nodes);


// Connect to the Redis cluster
const redisClient = createCluster({
  rootNodes: [
    {
      url: `redis://${config.redisConfig.nodes[0].host}:${config.redisConfig.nodes[0].port}`,
      socket: { 
        tls: false,
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000)
      }
    },
    {
      url: `redis://${config.redisConfig.nodes[1].host}:${config.redisConfig.nodes[1].port}`,
      socket: {
        tls: false,
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000)
      }
    },
    {
      url: `redis://${config.redisConfig.nodes[2].host}:${config.redisConfig.nodes[2].port}`,
      socket: {
        tls: false,
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000)
      }
    }
  ],
  defaults: {
    password: config.redisConfig.password,
    socket: {
      connectTimeout: 5000,
      commandTimeout: 3000
    }
  }
});

// Handle connection events
redisClient.on('error', (err) => console.error('Redis Cluster Error:', err));
redisClient.on('connecting', (event) => {
  console.log('Connecting to:', event.address, event.port);
});
redisClient.on('connect', () => console.log('Connected to Redis Cluster'));
redisClient.on('ready', () => console.log('Redis Cluster ready'));
redisClient.on('reconnecting', () => console.log('Reconnecting to Redis Cluster'));


// Connect to the cluster
redisClient.connect().catch(err => {
  console.error('Failed to connect to Redis Cluster:', err);
  process.exit(1);
});

async function shortenUrl(longUrl, userId) {
  const tracer = trace.getTracer('url-service');
  const span = tracer.startSpan('shorten-url');
  
  try {
    span.setAttributes({
      'url.original': longUrl,
      'user.id': userId || 'anonymous'
    });

    // Generate short URL ID
    const keySpan = tracer.startSpan('generate-short-id', { parent: span });
    const shortUrlId = await fetchUniqueKey();
    keySpan.end();

    // Store in database
    const dbSpan = tracer.startSpan('store-url', { parent: span });
    await createUrl(shortUrlId, longUrl, userId);
    dbSpan.end();

    // Cache in Redis
    const cacheSpan = tracer.startSpan('cache-url', { parent: span });
    await redisClient.setEx(shortUrlId, 3600, longUrl); // Cache for 1 hour
    cacheSpan.end();

    const shortUrl = `${config.baseUrl}/${shortUrlId}`;
    span.setAttributes({
      'url.short_id': shortUrlId,
      'url.short_url': shortUrl
    });

    return shortUrl;
  } catch (err) {
    span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

async function getLongUrl(shortUrlId) {
  const tracer = trace.getTracer('url-service');
  const span = tracer.startSpan('get-long-url');
  
  try {
    span.setAttributes({
      'url.short_id': shortUrlId
    });

    // Check cache first
    const cacheSpan = tracer.startSpan('redis-lookup', { parent: span });
    const startTime = Date.now();
    const cachedUrl = await redisClient.get(shortUrlId);
    cacheSpan.setAttributes({
      'cache.duration_ms': Date.now() - startTime,
      'cache.hit': !!cachedUrl
    });
    cacheSpan.end();

    if (cachedUrl) {
      span.setAttributes({
        'url.original': cachedUrl,
        'source': 'cache'
      });
      return cachedUrl;
    }

    // Fallback to PostgreSQL
    const dbSpan = tracer.startSpan('database-lookup', { parent: span });
    const longUrl = await getUrlByShortId(shortUrlId);
    dbSpan.end();

    // Cache the result
    const cacheWriteSpan = tracer.startSpan('cache-write', { parent: span });
    await redisClient.setEx(shortUrlId, 3600, longUrl);
    cacheWriteSpan.end();

    span.setAttributes({
      'url.original': longUrl,
      'source': 'database'
    });

    return longUrl;
  } catch (err) {
    span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

module.exports = { shortenUrl, getLongUrl, redisClient };