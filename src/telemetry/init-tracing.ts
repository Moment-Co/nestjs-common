import { TracingOptions, isGcpEnvironment } from './telemetry.types';

/**
 * Initializes OpenTelemetry tracing and metrics. Must be called **before**
 * any other imports in the service entry point (e.g. as a side-effect import
 * of `src/tracing.ts`).
 *
 * On GCP (Cloud Run) it exports to Cloud Trace and Cloud Monitoring.
 * Locally it is a no-op unless `enabled: true` is passed explicitly.
 *
 * Required peer packages (install in consuming service):
 * - `@opentelemetry/sdk-node`
 * - `@opentelemetry/auto-instrumentations-node`
 *
 * GCP-specific (optional — only needed when running on GCP):
 * - `@google-cloud/opentelemetry-cloud-trace-exporter`
 * - `@google-cloud/opentelemetry-cloud-monitoring-exporter`
 */
export function initTracing(options: TracingOptions): void {
  const enabled = options.enabled ?? isGcpEnvironment();
  if (!enabled) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Resource } = require('@opentelemetry/resources');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: options.serviceName,
    ...(options.serviceVersion && { [ATTR_SERVICE_VERSION]: options.serviceVersion }),
  });

  const traceExporter = loadTraceExporter(options.gcpProjectId);
  const metricReader = loadMetricReader(options.gcpProjectId);

  const sdkOptions: Record<string, unknown> = {
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        ...(options.ignoreIncomingPaths && {
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingPaths: options.ignoreIncomingPaths,
          },
        }),
      }),
    ],
  };

  if (metricReader) {
    sdkOptions.metricReader = metricReader;
  }

  const sdk = new NodeSDK(sdkOptions);
  sdk.start();

  const shutdown = () => {
    sdk
      .shutdown()
      .catch((err: unknown) => console.error('Telemetry shutdown error', err));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function loadTraceExporter(gcpProjectId?: string): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TraceExporter } = require('@google-cloud/opentelemetry-cloud-trace-exporter');
    return new TraceExporter(gcpProjectId ? { projectId: gcpProjectId } : undefined);
  } catch {
    // GCP exporter not installed — fall back to console
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
    return new ConsoleSpanExporter();
  }
}

function loadMetricReader(gcpProjectId?: string): unknown | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MetricExporter } = require('@google-cloud/opentelemetry-cloud-monitoring-exporter');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
    return new PeriodicExportingMetricReader({
      exporter: new MetricExporter(
        gcpProjectId ? { projectId: gcpProjectId } : undefined,
      ),
    });
  } catch {
    return undefined;
  }
}
