# Logger module

Winston-based logger with Nest wrapper and request-id context support.

## API surface

| Symbol | Role |
|--------|------|
| `LoggerModule` | Nest global module (`forRoot(options)`) |
| `MomentLogger` | Nest `LoggerService` implementation |
| `createLogger(options)` | Plain Winston logger factory (non-Nest runtimes) |
| `runWithRequestId(id, fn)` | Sets request context for current async chain |
| `getRequestId()` | Reads current request id from context (safe outside request) |
| `requestContextStorage` | Raw `AsyncLocalStorage` export for advanced integrations |

## `LoggerOptions`

- `service` (required): service identifier in log metadata
- `level` (optional): log level override; fallback order:
  1. `options.level`
  2. `process.env.LOG_LEVEL`
  3. `'info'`

## Default logger behavior

- Transport: console
- Metadata: `service`, `environment`
- Format:
  - non-production: colorized + simple
  - production: timestamp + JSON

## Nest usage

```typescript
import { Module } from '@nestjs/common';
import { LoggerModule } from '@momentco/nestjs-common';

@Module({
  imports: [LoggerModule.forRoot({ service: 'consumer-api' })],
})
export class AppModule {}
```

Inject and use:

```typescript
import { Injectable } from '@nestjs/common';
import { MomentLogger } from '@momentco/nestjs-common';

@Injectable()
export class UserService {
  constructor(private readonly logger: MomentLogger) {}

  run() {
    this.logger.log('job started', 'UserService');
  }
}
```

## Request-id propagation (Nest)

Use `RequestIdMiddleware` from this package so logs automatically include `requestId`.

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from '@momentco/nestjs-common';

@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
```

`RequestIdMiddleware` behavior:

- uses inbound `x-request-id` if present
- otherwise generates UUID
- sets response header `x-request-id`
- runs request chain in `AsyncLocalStorage` context

## Non-Nest usage

Use `createLogger` + `runWithRequestId` directly.

```typescript
import {
  createLogger,
  runWithRequestId,
  getRequestId,
} from '@momentco/nestjs-common';

const logger = createLogger({ service: 'calendar-functions' });

export const handler = (req: { headers: Record<string, string | undefined> }) => {
  const requestId = req.headers['x-request-id'] ?? crypto.randomUUID();
  runWithRequestId(requestId, () => {
    logger.info('request received', { requestId: getRequestId() });
  });
};
```

## Operational notes

- `getRequestId()` never throws; returns `undefined` outside request context.
- For logs to include request id, call logger inside `runWithRequestId(...)` scope.
- Keep `service` stable per application for clean cross-service log filtering.

## Importer service scenarios

### Scenario A: import job lifecycle logging

Log key transitions with stable context names:

```typescript
this.logger.log(`import job started: ${jobId}`, 'ImporterJobService');
this.logger.log(`import job completed: ${jobId}`, 'ImporterJobService');
```

### Scenario B: provider call failures

```typescript
this.logger.error(
  `provider call failed for job ${jobId}`,
  error instanceof Error ? error.stack : undefined,
  'ProviderClient',
);
```

### Scenario C: non-Nest background runner

```typescript
runWithRequestId(jobId, () => {
  logger.info('background import run', { jobId, requestId: getRequestId() });
});
```

### Scenario D: correlation-first troubleshooting

When importer API reports intermittent upstream failures:

- search by `requestId`
- follow same id across inbound logs and outbound HTTP logs
- correlate failed attempts and duration spikes
