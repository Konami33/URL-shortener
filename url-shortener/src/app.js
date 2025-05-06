require('./utils/tracing');
const express = require('express');
const winston = require('winston');
const { trace, metrics } = require('@opentelemetry/api');
const config = require('./config');
const urlRoutes = require('./routes/urlRoutes');
 
const app = express();

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// Metrics
const meter = metrics.getMeter('url-shortener');
const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests',
});
const requestDuration = meter.createHistogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
  unit: 'seconds',
  advice: { explicitBucketBoundaries: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5] },
});

// Middleware
app.use(express.json());
// Middleware for tracing and metrics
app.use((req, res, next) => {

  logger.info(`${req.method} ${req.url}`);

  const tracer = trace.getTracer('url-shortener');
  tracer.startActiveSpan(`${req.method} ${req.path}`, (span) => {
    span.setAttribute('http.method', req.method);
    span.setAttribute('http.route', req.path === '/' ? '/:shortUrlId' : req.path);
    const startTime = Date.now();
    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      span.setAttribute('http.status_code', res.statusCode);
      requestCounter.add(1, {
        'http.method': req.method,
        'http.route': req.path === '/' ? '/:shortUrlId' : req.path,
        'http.status_code': res.statusCode.toString(),
      });
      requestDuration.record(duration, {
        'http.method': req.method,
        'http.route': req.path === '/' ? '/:shortUrlId' : req.path,
        'http.status_code': res.statusCode.toString(),
      });
      span.end();
    });
    next();
  });
});

// Health Check
app.get('/health', (req, res) => res.status(200).json({ 
  status: 'OK' 
}));

app.get('/metrics', (req, res) => {
  res.status(200).send('Metrics exported via OTLP');
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
});