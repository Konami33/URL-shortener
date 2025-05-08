// utils/tracing.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { PeriodicExportingMetricReader, MeterProvider } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');
const { WinstonInstrumentation } = require('@opentelemetry/instrumentation-winston');
const config = require('../config');

// Create a common resource for traces and metrics
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'url-shortener',
  [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
});

// Initialize Prometheus Exporter with its own server on a different port
const prometheusExporter = new PrometheusExporter({
  port: 9464, // Different port than your Express app
  startServer: true, // Let it start its own server
});

// Create Meter Provider
const meterProvider = new MeterProvider({
  resource: resource,
  readers: [
    // OTLP Metrics Exporter
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: process.env.OTEL_METRICS_ENDPOINT || 'http://10.0.4.245:4318/v1/metrics',
      }),
      exportIntervalMillis: 15000,
    }),
    // Prometheus Exporter
    new PeriodicExportingMetricReader({
      exporter: prometheusExporter,
      exportIntervalMillis: 15000,
    })
  ]
});

// Initialize the SDK
const sdk = new NodeSDK({
  resource: resource,
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_TRACES_ENDPOINT || 'http://10.0.4.245:4318/v1/traces',
  }),
  instrumentations: [
    // Automatically instrument HTTP and Express
    new HttpInstrumentation({
      ignoreIncomingPaths: ['/health'],
    }),
    new ExpressInstrumentation(),
    new WinstonInstrumentation(),
    new PgInstrumentation(),
    new RedisInstrumentation(),
  ],
  meterProvider,
});

try {
  sdk.start();
  console.log('OpenTelemetry SDK initialized');
} catch (err) {
  console.error('Error initializing OpenTelemetry SDK:', err);
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down'))
    .catch((err) => console.error('Error shutting down OpenTelemetry SDK', err))
    .finally(() => process.exit(0));
});

// Export the modules for metrics creation
module.exports = {
  sdk,
  meterProvider,
  metrics: require('@opentelemetry/api').metrics,
};