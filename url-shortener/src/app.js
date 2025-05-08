// Load OpenTelemetry first
require('./utils/tracing');

const express = require('express');
const winston = require('winston');
const { metrics } = require('@opentelemetry/api');
const config = require('./config');
const urlRoutes = require('./routes/urlRoutes');

const app = express();

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// Create custom metrics
const meter = metrics.getMeter('url-shortener');

// Total HTTP requests
const httpRequestCounter = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
});

// HTTP request duration
const httpRequestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
});

// Success/failure counter
const httpResponseCounter = meter.createCounter('http_responses_total', {
  description: 'Total number of HTTP responses by status code',
});

// URL operations counter
const urlOperationsCounter = meter.createCounter('url_operations_total', {
  description: 'Number of URL shortening operations',
});

// URL redirect counter
const urlRedirectCounter = meter.createCounter('url_redirects_total', {
  description: 'Number of URL redirect operations',
});

// Middleware
app.use(express.json());

// Metrics and logging middleware
app.use((req, res, next) => {
  // Log request
  logger.info(`${req.method} ${req.url}`);
  
  // Track start time
  const startTime = Date.now();
  
  // Count request
  httpRequestCounter.add(1, {
    method: req.method,
    route: req.originalUrl,
  });
  
  // Track response
  const originalSend = res.send;
  res.send = function(...args) {
    // Calculate duration
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    
    // Record request duration
    httpRequestDuration.record(duration, {
      method: req.method,
      route: req.originalUrl,
    });
    
    // Record response status
    httpResponseCounter.add(1, {
      method: req.method,
      route: req.originalUrl,
      status_code: res.statusCode,
      status_class: Math.floor(res.statusCode / 100) + 'xx',
    });
    
    // Call original send
    return originalSend.apply(this, args);
  };
  
  next();
});

// Health Check
app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

// Make metrics available to route handlers
app.locals.metrics = {
  urlOperationsCounter,
  urlRedirectCounter
};

// Add an informational endpoint about metrics
app.get('/metrics-info', (req, res) => {
  res.status(200).json({
    message: "Prometheus metrics are available at http://localhost:9464/metrics",
    note: "This is a separate server running on port 9464"
  });
});

// Routes
app.use('/api', urlRoutes);

// Error Handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
  logger.info(`Prometheus metrics available at http://localhost:9464/metrics`);
});