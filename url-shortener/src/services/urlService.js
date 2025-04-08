const redis = require('redis');
const config = require('../config');
const Url = require('../models/mongoUrlModel');
const { fetchUniqueKey } = require('./keyService');

const redisClient = redis.createClient(config.redisConfig);
redisClient.connect();

async function shortenUrl(longUrl, userId) {
  const shortUrlId = await fetchUniqueKey();
  const url = new Url({ shortUrlId, longUrl, userId });
  await url.save();
  await redisClient.setEx(shortUrlId, 3600, longUrl); // Cache for 1 hour
  return `${config.baseUrl}/${shortUrlId}`;
}

async function getLongUrl(shortUrlId) {
  // Check cache first
  const cachedUrl = await redisClient.get(shortUrlId);
  if (cachedUrl) return cachedUrl;

  // Fallback to MongoDB
  const url = await Url.findOne({ shortUrlId });
  if (!url) throw new Error('URL not found');

  // Cache the result
  await redisClient.setEx(shortUrlId, 3600, url.longUrl);
  return url.longUrl;
}

module.exports = { shortenUrl, getLongUrl };