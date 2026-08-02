# Logger for Cloud Functions (non-NestJS)

This guide is for **Google Cloud Functions** and other **plain Node.js** runtimes that are **not** using NestJS. It describes how to replace ad-hoc `console.log` with the same Winston-based logger used by Nest services, how log lines are shaped for **Cloud Logging**, and how to attach the **GCP transport** so entries appear as structured logs in the console.

The public API you need from `@momentco/nestjs-common` is:

| Symbol | Role |
|--------|------|
| `createLogger` | Builds a `winston.Logger` with consistent format and metadata |
| `createGcpLoggingTransport` | Optional transport that sends logs to Cloud Logging |
| `runWithRequestId` / `getRequestId` | Correlate logs per invocation (recommended for HTTP triggers) |
| `LoggerOptions` | Options passed to `createLogger` |

You do **not** need `LoggerModule`, `MomentLogger`, or Nest for this path.

---

## Why use this instead of `console.log`?

- **Structured fields** (`service`, `environment`, optional `requestId`, `context`) make Logs Explorer filters reliable.
- **Severity** maps correctly to Cloud Logging levels when using the GCP transport.
- **Same format as microservices** that use `@momentco/nestjs-common`, so operators can use one set of queries and dashboards.

---

## Dependencies

In the Cloud Function project:

```bash
pnpm add @momentco/nestjs-common @google-cloud/logging-winston
```

- **Winston** is already a **dependency** of `@momentco/nestjs-common`; you do not need to add `winston` separately unless you want a specific version pinned in your app.
- **`@google-cloud/logging-winston`** is an **optional peer** of the library; install it in the function so `createGcpLoggingTransport()` can construct a real transport in GCP.

Nest-related peers (`@nestjs/common`, etc.) are declared by the package for Nest apps. If your function only imports logging helpers, the bundler/runtime may still resolve them; if you hit peer warnings, install the listed Nest peers or use a minimal install strategy your repo already uses for shared libs.

---

## `createLogger(options)`

Defined in [`src/logging/logger.service.ts`](../src/logging/logger.service.ts).

### `LoggerOptions`

| Field | Required | Description |
|-------|----------|-------------|
| `service` | Yes | Stable name for this function (e.g. `calendar-sync-worker`). Used as `service` on every log line. |
| `level` | No | Log level. Falls back to `process.env.LOG_LEVEL`, then `'info'`. Valid values: `error`, `warn`, `info`, `debug`, `verbose`. |
| `transports` | No | Extra Winston transports. Pass `[createGcpLoggingTransport()]` for Cloud Logging in GCP. `undefined` entries are ignored. |

### Console transport (always)

`createLogger` always adds a **Console** transport:

- **`NODE_ENV !== 'production'`** — colorized, human-readable (`simple` format). Good for local emulators.
- **`NODE_ENV === 'production'`** — **JSON** to stdout (timestamp + `winston.format.json()`). Cloud Logging ingests stdout JSON as structured data even without `logging-winston`; the GCP transport adds a native Logging API path with richer metadata.

### Creating the logger once per cold start

Create the logger **at module scope** (outside the handler) so each instance reuses it:

```typescript
import { createLogger, createGcpLoggingTransport } from '@momentco/nestjs-common';

const logger = createLogger({
  service: 'my-cloud-function',
  transports: [createGcpLoggingTransport()],
});
```

---

## Log message format (Winston API)

The return type of `createLogger` is a standard **`winston.Logger`**. Use the usual methods:

| Method | Typical use |
|--------|-------------|
| `logger.info(message, meta?)` | Normal operational messages |
| `logger.warn(message, meta?)` | Recoverable issues |
| `logger.error(message, meta?)` | Failures; put stack in `meta` (see below) |
| `logger.debug` / `logger.verbose` | Verbose diagnostics when `LOG_LEVEL` allows |

**First argument** is always the **string message** (or object—Winston allows objects, but strings keep Cloud Logging message fields consistent).

**Second argument** is optional **metadata** (plain object). It is merged into the log record and appears under **`jsonPayload`** in Cloud Logging when structured.

### Recommended metadata keys

| Key | Purpose |
|-----|---------|
| `context` | Logical component (e.g. `PubSubHandler`, `StripeWebhook`) — same idea as Nest `MomentLogger`’s context string |
| `requestId` | Correlation ID for this invocation (see below) |
| `trace` | Stack trace string on errors |
| Any custom fields | `jobId`, `userId`, `eventType`, etc. — keep values small and non-sensitive |

### Aligning with Nest `MomentLogger` shape

Nest’s `MomentLogger` effectively does:

- `info`: `{ context, requestId? }`
- `error`: `{ trace, context, requestId? }`

For Cloud Functions, mirror that with explicit meta:

```typescript
logger.info('Job started', { context: 'ImportJob', jobId });
logger.error('Upstream failed', {
  trace: err instanceof Error ? err.stack : undefined,
  context: 'HttpClient',
  jobId,
});
```

---

## Production JSON shape (stdout)

With `NODE_ENV=production`, each line printed to stdout is a **single JSON object** (Winston’s json format). Fields typically include:

| Field | Source |
|-------|--------|
| `level` | Winston level (`info`, `error`, …) |
| `message` | First argument to `logger.info` / `logger.error`, etc. |
| `service` | From `LoggerOptions.service` (`defaultMeta`) |
| `environment` | `process.env.NODE_ENV` |
| `timestamp` | ISO timestamp from Winston |
| Plus any **meta** keys you passed as the second argument (`context`, `requestId`, `trace`, custom fields) |

**Example** (pretty-printed):

```json
{
  "level": "info",
  "message": "Webhook processed",
  "service": "stripe-webhook-fn",
  "environment": "production",
  "timestamp": "2026-04-06T12:00:00.000Z",
  "context": "StripeWebhook",
  "requestId": "7b2c9e1a-4d3f-4b1a-9c0e-1234567890ab",
  "eventType": "checkout.session.completed"
}
```

In **Logs Explorer**, these keys usually appear under **JSON payload** (`jsonPayload.message`, `jsonPayload.service`, …) depending on ingestion path.

---

## GCP transport layer (`createGcpLoggingTransport`)

Defined in [`src/logging/gcp-logging.transport.ts`](../src/logging/gcp-logging.transport.ts).

### Behavior

- Returns a **`winston.transport`** that uses **`@google-cloud/logging-winston`** (`LoggingWinston`), or **`undefined`** if:
  - the transport is **disabled**, or
  - the package failed to load.
- When the return value is `undefined`, `createLogger` **drops** it (only real transports are pushed).

### When it is enabled

By default, **`enabled`** is `true` only when **`isGcpEnvironment()`** is true:

```typescript
// From telemetry.types — Cloud Run sets this
export function isGcpEnvironment(): boolean {
  return !!process.env.K_SERVICE;
}
```

- **Cloud Functions (2nd gen)** run on Cloud Run and typically have **`K_SERVICE`** set → GCP transport enables automatically if you pass `createGcpLoggingTransport()` with no options.
- **Cloud Functions (1st gen)** often **do not** set `K_SERVICE` → the transport stays off unless you pass **`enabled: true`** explicitly for deployed environments.

### Options (`GcpLoggingTransportOptions`)

| Field | Description |
|-------|-------------|
| `enabled` | Force on (`true`) or off (`false`). Use `true` in Gen1 when deployed. |
| `gcpProjectId` | Optional; defaults to the project inferred from the environment (metadata / ADC). |

### Example: Gen1 explicit enable

```typescript
const onGcp =
  process.env.FUNCTION_TARGET !== undefined ||
  process.env.K_SERVICE !== undefined;

const logger = createLogger({
  service: 'legacy-gen1-fn',
  transports: [
    createGcpLoggingTransport({
      enabled: onGcp,
    }),
  ],
});
```

### IAM

The function’s **runtime service account** needs **`roles/logging.logWriter`** (or a custom role with `logging.logEntries.create`) on the project. This is the same requirement as for other GCP workloads writing logs via the Logging API.

---

## Request / invocation correlation (`runWithRequestId`)

[`runWithRequestId`](../src/logging/request-context.ts) stores a string in **AsyncLocalStorage** for the duration of the callback. **`getRequestId()`** reads it inside nested calls.

**Pattern for HTTP functions:** wrap the whole handler body so every log can include the same id:

```typescript
import {
  createLogger,
  createGcpLoggingTransport,
  runWithRequestId,
  getRequestId,
} from '@momentco/nestjs-common';
import { randomUUID } from 'crypto';

const logger = createLogger({
  service: 'http-fn',
  transports: [createGcpLoggingTransport()],
});

export const handler = async (req: { headers?: Record<string, string | undefined> }, res: { send: (b: string) => void }) => {
  const requestId = req.headers?.['x-request-id'] ?? randomUUID();

  await runWithRequestId(requestId, async () => {
    logger.info('Request start', { context: 'handler', requestId: getRequestId() });
    try {
      // ... work ...
      res.send('ok');
    } catch (e) {
      logger.error('Request failed', {
        context: 'handler',
        requestId: getRequestId(),
        trace: e instanceof Error ? e.stack : String(e),
      });
      throw e;
    }
  });
};
```

**Pattern for Pub/Sub / background functions:** use the message id or a generated id as the “request” id:

```typescript
await runWithRequestId(attributes.messageId ?? randomUUID(), async () => {
  logger.info('Processing message', { context: 'subscriber', requestId: getRequestId() });
});
```

If you **do not** use `runWithRequestId`, still pass `requestId` manually in meta when you have a stable id.

---

## Full minimal example (HTTP, Gen2-style)

```typescript
import { createLogger, createGcpLoggingTransport, runWithRequestId, getRequestId } from '@momentco/nestjs-common';
import { randomUUID } from 'crypto';
import type { Request, Response } from '@google-cloud/functions-framework';

const logger = createLogger({
  service: 'example-http-fn',
  transports: [createGcpLoggingTransport()],
});

export async function main(req: Request, res: Response): Promise<void> {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

  await runWithRequestId(requestId, async () => {
    res.setHeader('x-request-id', requestId);
    logger.info(`${req.method} ${req.path}`, { context: 'http', requestId: getRequestId() });
    res.status(200).send('ok');
  });
}
```

Adjust types/imports to match your **functions-framework** or **Firebase Functions** entrypoint.

---

## Migrating from `console.log`

| Before | After |
|--------|--------|
| `console.log('done', jobId)` | `logger.info('done', { context: 'Worker', jobId })` |
| `console.error(err)` | `logger.error(err instanceof Error ? err.message : 'Error', { trace: err instanceof Error ? err.stack : undefined, context: 'Worker' })` |
| `JSON.stringify({ a: 1 })` | `logger.info('state', { a: 1 })` — let Winston JSON-format the line |

**Checklist**

1. Add `@momentco/nestjs-common` and `@google-cloud/logging-winston`.
2. Create one module-scoped `logger` with `service` matching the function name used in ops.
3. Add `transports: [createGcpLoggingTransport({ enabled: ... })]` if you need Gen1 or non-`K_SERVICE` environments.
4. Set **`NODE_ENV=production`** in deployed functions so stdout logs are JSON (and levels are consistent).
5. Wrap handlers with **`runWithRequestId`** when you have a natural id (HTTP header, message id).
6. Replace `console.*` with `logger.*` and move variables into the **meta** object.

---

## Querying in Cloud Logging

After deployment, in **Logs Explorer** (`https://console.cloud.google.com/logs/query`):

```text
resource.type="cloud_function"
resource.labels.function_name="YOUR_FUNCTION_NAME"
jsonPayload.service="my-cloud-function"
```

Or search by correlation:

```text
jsonPayload.requestId="7b2c9e1a-4d3f-4b1a-9c0e-1234567890ab"
```

Resource types may be `cloud_function` (Gen1) or `cloud_run_revision` (Gen2); adjust filters accordingly.

---

## Related documentation

- [Logger module](logger-module.md) — NestJS `LoggerModule`, `MomentLogger`, middleware
- [Telemetry module](telemetry-module.md) — tracing, metrics, Error Reporting, Profiler (optional for functions)
- OpenTelemetry / Cloud Trace for functions is **not** covered here; use `initTracing` from the telemetry doc only if you add the OTel peer packages and call it **before** other imports in a supported entry layout.
