// src/config/index.js
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  pgConfig: {
    host: process.env.PG_HOST,
    port: process.env.PG_PORT || 6432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    connectionTimeoutMillis: 5000,  // 5s timeout
    idleTimeoutMillis: 30000,       // 30s idle
    max: 20,                        // Max connections in pool
    min: 5,                         // Min connections in pool
  },
  redisConfig: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
  baseUrl: process.env.BASE_URL,
};