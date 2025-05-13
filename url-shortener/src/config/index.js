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
    // For cluster, we specify multiple nodes
    nodes: [
      { host: process.env.REDIS_NODE1, port: process.env.REDIS_PORT || 6379 },
      { host: process.env.REDIS_NODE2, port: process.env.REDIS_PORT || 6379 },
      { host: process.env.REDIS_NODE3, port: process.env.REDIS_PORT || 6379 },
    ],
    password: process.env.REDIS_PASSWORD,
    // Optional cluster-specific settings
    options: {
      scaleReads: 'slave', // Distribute reads to replicas
      enableAutoPipelining: true,
      maxRedirections: 16, // Maximum retry attempts for MOVED/ASK redirections
    }
  },
  baseUrl: process.env.BASE_URL,
  tracing_endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT_TRACING || 'http://localhost:4317',
};