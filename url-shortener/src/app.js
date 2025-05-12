const express = require('express');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const urlRoutes = require('./routes/urlRoutes');

require('./utils/tracing');
const { context, trace } = require('@opentelemetry/api');

const app = express();

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', requestId);
  
  const tracer = trace.getTracer('http-server');
  const span = tracer.startSpan(`HTTP ${req.method} ${req.path}`);
  
  span.setAttributes({
    'http.method': req.method,
    'http.route': req.path,
    'http.url': req.url,
    'http.host': req.hostname,
    'http.user_agent': req.get('user-agent'),
    'http.client_ip': req.ip,
    'http.protocol': req.protocol,
    'http.secure': req.secure,
    'request.id': requestId
  });

  const start = Date.now();
  
  context.with(trace.setSpan(context.active(), span), () => {
    logger.info({
      message: `Request started`,
      method: req.method,
      url: req.url,
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      requestId: requestId
    });
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      span.setAttributes({
        'http.status_code': res.statusCode,
        'http.response_time_ms': duration
      });
      span.end();
      
      logger.info({
        message: `Request completed`,
        statusCode: res.statusCode,
        durationMs: duration,
        traceId: span.spanContext().traceId
      });
    });
    
    next();
  });
});

// Health Check
app.get('/health', (req, res) => {
  const span = trace.getTracer('health-check').startSpan('health-check');
  try {
    span.setStatus({ code: trace.SpanStatusCode.OK });
    res.status(200).json({ status: 'OK' });
  } finally {
    span.end();
  }
});

// Routes
app.use('/api', urlRoutes);

// Error Handler
app.use((err, req, res, next) => {
  const activeSpan = trace.getActiveSpan() || 
    trace.getTracer('error-handler').startSpan('server-error');
  
  activeSpan.setAttributes({
    'error.message': err.message,
    'error.stack': err.stack,
    'http.status_code': 500
  });
  
  activeSpan.setStatus({
    code: trace.SpanStatusCode.ERROR,
    message: err.message
  });
  
  activeSpan.recordException(err);
  
  logger.error({
    message: err.message,
    stack: err.stack,
    traceId: activeSpan.spanContext().traceId,
    spanId: activeSpan.spanContext().spanId,
    requestId: req.headers['x-request-id']
  });

  if (!trace.getActiveSpan()) activeSpan.end();
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});