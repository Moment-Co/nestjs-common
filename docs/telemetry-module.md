# Telemetry module

GCP-native APM (Application Performance Monitoring) primitives: OpenTelemetry tracing/metrics, Cloud Logging, Cloud Error Reporting, and Cloud Profiler. All features auto-detect the GCP environment (Cloud Run) and are no-ops locally unless explicitly enabled.

## API surface

| Symbol | Role |
|--------|------|
| `initTracing(options)` | Pre-bootstrap: starts OTel SDK with Cloud Trace + Cloud Monitoring exporters |
| `startProfiler(options)` | Pre-bootstrap: starts Cloud Profiler agent |
| `TelemetryModule` | NestJS dynamic module (`forRoot`) — registers error reporting + exception filter |
| `GcpExceptionFilter` | Extends `MomentExceptionFilter` to report 5xx errors to Cloud Error Reporting |
| `GcpErrorReporter` | Injectable wrapper around `@google-cloud/error-reporting` |
| `createGcpLoggingTransport(options?)` | Returns a Winston transport for Cloud Logging (or `undefined` when disabled) |
| `isGcpEnvironment()` | Returns `true` when `K_SERVICE` env var is set (Cloud Run) |
| `TELEMETRY_OPTIONS` | Injection token for telemetry options (advanced) |
| `TracingOptions` | Options for `initTracing` |
| `ProfilerOptions` | Options for `startProfiler` |
| `ErrorReportingOptions` | Options for `TelemetryModule.forRoot` |
| `GcpLoggingTransportOptions` | Options for `createGcpLoggingTransport` |

## Environment behavior

| Component | Local | Dev (Cloud Run) | Prod (Cloud Run) |
|-----------|-------|-----------------|-------------------|
| Cloud Trace | Disabled | GCP | GCP |
| Cloud Monitoring | Disabled | GCP | GCP |
| Cloud Logging | Console only | stdout → Cloud Logging | stdout → Cloud Logging |
| Error Reporting | Console only | GCP | GCP |
| Cloud Profiler | Disabled | GCP | GCP |

Auto-detection uses `process.env.K_SERVICE` (set automatically by Cloud Run). All options accept `enabled?: boolean` to override.

## Required peer packages

Install only the packages you need in the consuming service:

```bash
# Tracing + metrics (Cloud Trace / Cloud Monitoring)
pnpm add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
pnpm add @google-cloud/opentelemetry-cloud-trace-exporter
pnpm add @google-cloud/opentelemetry-cloud-monitoring-exporter

# Cloud Logging
pnpm add @google-cloud/logging-winston

# Error Reporting (via TelemetryModule)
pnpm add @google-cloud/error-reporting

# Cloud Profiler
pnpm add @google-cloud/profiler
```

All packages are optional peer dependencies — features degrade gracefully when packages are missing.

## Per-service wiring

### 1. Create `src/tracing.ts` (loaded before anything else)

```typescript
import { initTracing } from '@momentco/nestjs-common';

initTracing({
  serviceName: 'consumer-api',
  // GCP auto-detected; pass enabled: true to force on locally
  ignoreIncomingPaths: [/\/health/],
});
```

### 2. Update `src/main.ts`

```typescript
import './tracing'; // MUST be the first import

import { NestFactory } from '@nestjs/core';
import { startProfiler } from '@momentco/nestjs-common';
import { AppModule } from './app.module';

async function bootstrap() {
  if (process.env.ENABLE_PROFILER === 'true') {
    await startProfiler({ serviceName: 'consumer-api' });
  }

  const app = await NestFactory.create(AppModule);
  // ... existing setup (middleware, pipes, etc.) ...
  await app.listen(3000);
}
bootstrap();
```

### 3. Update `src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import {
  LoggerModule,
  TelemetryModule,
  createGcpLoggingTransport,
} from '@momentco/nestjs-common';

@Module({
  imports: [
    LoggerModule.forRoot({
      service: 'consumer-api',
      transports: [createGcpLoggingTransport()],
    }),
    TelemetryModule.forRoot({ serviceName: 'consumer-api' }),
    // ... other modules ...
  ],
})
export class AppModule {}
```

When using `TelemetryModule`, do **not** separately register `MomentExceptionFilter` — `GcpExceptionFilter` extends it and handles both the standard error response and GCP error reporting.

## IAM roles

The Cloud Run service account needs:

| Role | Purpose |
|------|---------|
| `roles/cloudtrace.agent` | Cloud Trace span export |
| `roles/monitoring.metricWriter` | Cloud Monitoring metric export |
| `roles/logging.logWriter` | Cloud Logging |
| `roles/errorreporting.writer` | Cloud Error Reporting |
| `roles/cloudprofiler.agent` | Cloud Profiler |

These are infrastructure concerns — apply them via Terraform or `gcloud` on the service account, not in application code.

## Local development

By default, all telemetry is **disabled** locally (no `K_SERVICE` env var). To export real telemetry to a dev GCP project:

1. Run `gcloud auth application-default login`
2. Set `enabled: true` in `initTracing`, `startProfiler`, etc.
3. Optionally set `gcpProjectId` if not using the default project

## `initTracing` details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | (required) | OTel resource `service.name` |
| `enabled` | `boolean` | `!!process.env.K_SERVICE` | Enable GCP exporters |
| `gcpProjectId` | `string` | Auto from metadata | GCP project for exporters |
| `serviceVersion` | `string` | — | OTel resource `service.version` |
| `ignoreIncomingPaths` | `(string \| RegExp)[]` | — | HTTP paths to exclude from tracing |

When enabled, the SDK registers auto-instrumentations for HTTP, Express, `pg`, `ioredis`, and other common libraries (via `@opentelemetry/auto-instrumentations-node`). Several noisy instrumentations are **disabled by default** and can be opt-in via env vars — see [Runtime env vars](#runtime-env-vars) below.

Graceful shutdown is wired to `SIGTERM` and `SIGINT`.

## Runtime env vars

All telemetry behaviours that have a meaningful performance cost can be toggled via env vars at deploy time without a code change.

| Env var | Default | What it controls |
|---------|---------|-----------------|
| `ENABLE_PROFILER` | `false` | Cloud Profiler (CPU + heap flame graphs). Adds ~8-12s cold-start + periodic GC pauses. Enable for targeted debugging sessions only. |
| `ENABLE_OTEL_RUNTIME_NODE` | `false` | OTel runtime metrics: event loop lag, GC pause duration, heap stats exported to Cloud Monitoring. Useful when investigating event loop saturation. |
| `ENABLE_OTEL_DNS` | `false` | OTel DNS instrumentation. Adds spans for every DNS lookup; rarely actionable in Cloud Run. |
| `ENABLE_OTEL_NET` | `false` | OTel TCP socket instrumentation. Low-level noise below HTTP/pg/ioredis spans. |
| `ENABLE_OTEL_GRPC` | `false` | OTel gRPC instrumentation. In Moment services this only traces APM agent calls (meta-telemetry). |
| `ENABLE_OTEL_WINSTON` | `false` | OTel Winston instrumentation — injects `trace_id`/`span_id` into log records. Cloud Run already provides log-trace correlation natively via `X-Cloud-Trace-Context`. |

Set any of these to `'true'` on the Cloud Run service (or locally in `.env`) to enable.

## `startProfiler` details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | (required) | Profiler service name |
| `enabled` | `boolean` | `!!process.env.K_SERVICE` | Enable Cloud Profiler |
| `serviceVersion` | `string` | `'0.0.0'` | Profiler service version |

Cloud Profiler uses its own SDK, not OpenTelemetry. It must be started in `bootstrap()` (async) before `NestFactory.create()`.

## `createGcpLoggingTransport` details

Returns a `winston.transport` instance (or `undefined` when disabled / package missing). Pass it in the `transports` array of `LoggerOptions` — `undefined` entries are automatically filtered out.

```typescript
LoggerModule.forRoot({
  service: 'consumer-api',
  transports: [createGcpLoggingTransport({ gcpProjectId: 'my-project' })],
})
```

## `TelemetryModule.forRoot` details

Registers `GcpErrorReporter` and `GcpExceptionFilter` globally. Options match `ErrorReportingOptions`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | (required) | Error Reporting service context |
| `enabled` | `boolean` | `!!process.env.K_SERVICE` | Enable Cloud Error Reporting |
| `gcpProjectId` | `string` | Auto from metadata | GCP project |

The filter reports only 5xx errors to Cloud Error Reporting. 4xx client errors are handled by `MomentExceptionFilter` as usual.

## Source layout

```
src/telemetry/
  telemetry.types.ts      — shared option interfaces + isGcpEnvironment()
  telemetry.constants.ts  — TELEMETRY_OPTIONS injection token
  init-tracing.ts         — OTel NodeSDK factory
  start-profiler.ts       — Cloud Profiler wrapper
  gcp-error-reporter.ts   — Error Reporting injectable service
  gcp-exception.filter.ts — exception filter extending MomentExceptionFilter
  telemetry.module.ts     — NestJS dynamic module
  index.ts                — barrel re-exports

src/logging/
  gcp-logging.transport.ts — Cloud Logging Winston transport factory
```
