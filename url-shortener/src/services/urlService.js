const redis = require('redis');
const config = require('../config');
const { createUrl, getUrlByShortId } = require('../models/pgUrlModel');
const { fetchUniqueKey } = require('./keyService');

const redisClient = redis.createClient({
  socket: {
    host: config.redisConfig.host,
    port: parseInt(config.redisConfig.port),
  },
  password: config.redisConfig.password,
});
redisClient.connect();

async function shortenUrl(longUrl, userId) {
  const shortUrlId = await fetchUniqueKey();
  await createUrl(shortUrlId, longUrl, userId);
  await redisClient.setEx(shortUrlId, 3600, longUrl); // Cache for 1 hour
  return `${config.baseUrl}/${shortUrlId}`;
}

async function getLongUrl(shortUrlId) {
  try {
    // Check cache first
    const cachedUrl = await redisClient.get(shortUrlId);
    if (cachedUrl) return cachedUrl;

    // Fallback to PostgreSQL (Citus)
    const longUrl = await getUrlByShortId(shortUrlId);
    if (!longUrl) throw new Error('URL not found');

    // Cache the result
    await redisClient.setEx(shortUrlId, 3600, longUrl);
    return longUrl;
  } catch (err) {
    console.error(`Error retrieving URL for ${shortUrlId}: ${err.message}`);
    throw err;
  }
}

module.exports = { shortenUrl, getLongUrl };