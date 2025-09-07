// app/server.js
const express = require('express');
const client = require('prom-client');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// OpenTelemetry setup
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { trace, SpanStatusCode } = require('@opentelemetry/api');

const otlpOptions = {
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
};
const exporter = new OTLPTraceExporter(otlpOptions);

const sdk = new NodeSDK({
  traceExporter: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

(async () => {
  try {
    await sdk.start();
    console.log('OpenTelemetry started');
  } catch (err) {
    console.error('OpenTelemetry failed to start', err);
  }
})();

// Logger & file for Promtail
const logsDir = path.resolve(process.env.LOGS_DIR || '/app/logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFile = path.join(logsDir, 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
const logger = pino({ level: 'info' });

function logToFile(message) {
  logStream.write(`${new Date().toISOString()} ${JSON.stringify(message)}\n`);
}

// Express app & Prometheus metrics
const app = express();
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: 'app_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpDuration = new client.Histogram({
  name: 'app_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const successRequests = new client.Counter({
  name: 'app_http_success_total',
  help: 'Total successful HTTP requests',
  labelNames: ['route'],
});

const errorRequests = new client.Counter({
  name: 'app_http_error_total',
  help: 'Total failed HTTP requests',
  labelNames: ['route'],
});

register.registerMetric(httpRequests);
register.registerMetric(httpDuration);
register.registerMetric(successRequests);
register.registerMetric(errorRequests);

app.use(express.json());

// Middleware for metrics + logs
app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const delta = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route?.path || req.path || 'unknown';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };

    httpRequests.inc(labels);
    httpDuration.observe(labels, delta);

    if (res.statusCode >= 200 && res.statusCode < 400) {
      successRequests.inc({ route });
    } else {
      errorRequests.inc({ route });
    }

    const logEntry = { method: req.method, route, status: res.statusCode, duration_s: delta };
    logger.info(logEntry, 'request_finished');
    logToFile(logEntry);
  });

  next();
});

// OpenTelemetry tracer
const tracer = trace.getTracer('demo-app');

// Routes with manual spans
app.get('/', async (req, res) => {
  await tracer.startActiveSpan('root_route', async (span) => {
    res.json({ ok: true, message: 'Hello from demo app' });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  });
});

app.get('/work', async (req, res) => {
  await tracer.startActiveSpan('work_route', async (span) => {
    try {
      const ms = Math.floor(Math.random() * 500);
      await new Promise(r => setTimeout(r, ms));

      if (Math.random() < 0.1) {
        logger.warn({ path: '/work', reason: 'random_failure' }, 'simulated_error');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Random failure' });
        span.end();
        return res.status(500).json({ ok: false, error: 'Random failure occurred' });
      }

      res.json({ ok: true, simulated_ms: ms });
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
});

app.get('/error', async (req, res) => {
  await tracer.startActiveSpan('error_route', async (span) => {
    logger.error({ path: '/error' }, 'forced_error');
    res.status(500).json({ ok: false, error: 'Simulated server error' });
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'Forced error' });
    span.end();
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Demo app listening on port ${port}`));

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  try { await sdk.shutdown(); }
  catch (err) { console.error('Error shutting down OpenTelemetry', err); }
  process.exit(0);
});
