const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');
const { WinstonInstrumentation } = require('@opentelemetry/instrumentation-winston');
const config = require('../config');

const sdk = new NodeSDK({
  serviceName: 'url-shortener',
  traceExporter: new OTLPTraceExporter({
    url: config.tracing_endpoint,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: config.metrics_endpoint,
    }),
    exportIntervalMillis: 10000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        applyCustomAttributesOnSpan: (span, req) => {
          span.setAttribute('http.user_id', req.body?.user_id || 'anonymous');
        },
      },
    }),
    new PgInstrumentation({
      enhancedDatabaseReporting: true,
      requireParentSpan: true,
    }),
    new RedisInstrumentation(),
    new WinstonInstrumentation(),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down'))
    .catch((err) => console.error('Error shutting down SDK', err));
});