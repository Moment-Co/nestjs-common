# Health module

Pluggable HTTP health checks for NestJS apps: you register small **check classes** (database, Redis, Pub/Sub, etc.), and the module exposes a single endpoint that runs them in parallel and returns a consolidated JSON body with optional **critical** vs **non-critical** semantics.

You can use the **built-in** TypeORM and Redis checks from this package, implement `HealthCheck` yourself for other systems (Pub/Sub, HTTP, etc.), or both.

## Getting started

1. **Add the dependency** (your app already depends on `@nestjs/common` / `@nestjs/core`):

   ```bash
   pnpm add @momentco/nestjs-common
   ```

2. **Register checks** — use [built-in checks](#built-in-checks) where they fit, and/or implement `HealthCheck` for custom probes (see [Implementing a check](#implementing-a-check)).

3. **Import `HealthModule.forRoot`** in your root module with `checks`, `criticalKeys`, and optional `path` / `imports` (see [Nest usage](#nest-usage)).

4. **Call** `GET /health` (or your configured path) and verify the JSON shape (see [Response shape](#response-shape)).

## API surface

| Symbol | Role |
|--------|------|
| `HealthModule` | Dynamic module (`forRoot` / `forRootAsync`) |
| `HealthCheck` | Interface: `check(): Promise<HealthCheckDetail>` |
| `HealthModuleOptions` | Options for `forRoot` (`checks`, `criticalKeys`, `path`, `imports`) |
| `HealthCheckRegistration` | `{ key, useClass }` entry for a single probe |
| `HealthAggregatorService` | Runs all registered checks (injectable if you need tests or custom wiring) |
| `HEALTH_MODULE_OPTIONS` | Injection token for resolved options (advanced) |
| `aggregateHealth` | Pure function for the same aggregation rules as the HTTP endpoint |
| `HealthCheckResponse`, `HealthCheckDetail`, `HealthCheckStatus` | Response types |
| `assertHealthModuleOptions` | Validates that every `criticalKeys` entry has a matching `checks` key |
| `rejectAfter` | Timeout helper for race-with-timeout probes |
| `createHealthController` | Low-level: builds the controller class for a path (advanced / testing) |
| `DatabaseHealthCheck` | Built-in: `SELECT 1` via TypeORM `DataSource` (3s timeout) |
| `RedisHealthCheck` | Built-in: `PING` via injected `RedisPingClient` (`HEALTH_REDIS_CLIENT` token) |
| `HEALTH_REDIS_CLIENT` | Injection token for the Redis client used by `RedisHealthCheck` |
| `RedisPingClient` | Type: `{ ping(): Promise<string> }` (compatible with `ioredis`) |
| `PubSubHealthCheck` | Built-in: `getTopics({ pageSize: 1 })` via `PubSubPingClient` (`HEALTH_PUBSUB_CLIENT`) |
| `HEALTH_PUBSUB_CLIENT` | Injection token for the Pub/Sub client used by `PubSubHealthCheck` |
| `PubSubPingClient` | Minimal type for `PubSub#getTopics` (returns `Promise<unknown>`) |
| `RedisHealthModule` | Optional `register()` dynamic module — wires `HEALTH_REDIS_CLIENT` with dynamic `ioredis` load |
| `PubSubHealthModule` | Optional `register()` dynamic module — wires `HEALTH_PUBSUB_CLIENT` with dynamic `@google-cloud/pubsub` load |

## Built-in checks

### `DatabaseHealthCheck`

- **Requires:** `typeorm` peer and a registered `DataSource` (for example after `TypeOrmModule.forRoot` in your app).
- **Behavior:** `SELECT 1` with a 3s timeout.

```typescript
checks: [{ key: 'database', useClass: DatabaseHealthCheck }],
```

### `RedisHealthCheck`

- **Requires:** A client implementing `RedisPingClient` (typically `ioredis`) registered under **`HEALTH_REDIS_CLIENT`**, or use **`RedisHealthModule.register()`** which loads `ioredis` dynamically and reads `options.url` / `process.env.REDIS_URL`.
- **Behavior:** `PING` with a 3s timeout. If no client is injected, returns `fail` with error `"Redis not configured"` (often registered as a **non-critical** check).

```typescript
import {
  HealthModule,
  RedisHealthCheck,
  DatabaseHealthCheck,
  RedisHealthModule,
} from '@momentco/nestjs-common';

@Module({
  imports: [
    HealthModule.forRoot({
      imports: [RedisHealthModule.register()],
      checks: [
        { key: 'database', useClass: DatabaseHealthCheck },
        { key: 'redis', useClass: RedisHealthCheck },
      ],
      criticalKeys: ['database'],
    }),
  ],
})
export class AppModule {}
```

You can still bind **`HEALTH_REDIS_CLIENT`** yourself if you need custom Redis options.

### `PubSubHealthCheck`

- **Requires:** A client implementing **`PubSubPingClient`** under **`HEALTH_PUBSUB_CLIENT`**, or **`PubSubHealthModule.register()`** which loads `@google-cloud/pubsub` dynamically and uses `options.projectId` / `process.env.GCP_PROJECT_ID` / `process.env.GOOGLE_CLOUD_PROJECT`.
- **Behavior:** Calls `getTopics({ pageSize: 1 })` (read-only list; no publish). 3s timeout. If no client, fails with `"Pub/Sub not configured"`. Ensure the runtime identity has **`pubsub.topics.list`** (or equivalent) if you rely on this check.

```typescript
import {
  HealthModule,
  PubSubHealthCheck,
  PubSubHealthModule,
  DatabaseHealthCheck,
} from '@momentco/nestjs-common';

@Module({
  imports: [
    HealthModule.forRoot({
      imports: [PubSubHealthModule.register()],
      checks: [
        { key: 'database', useClass: DatabaseHealthCheck },
        { key: 'pubsub', useClass: PubSubHealthCheck },
      ],
      criticalKeys: ['database'],
    }),
  ],
})
export class AppModule {}
```

## Aggregation rules

The module uses `aggregateHealth` internally:

- Any **critical** check with `status: "fail"` → overall `"fail"` and **HTTP 503**.
- Any **non-critical** check with `status: "fail"` → overall `"degraded"` and **HTTP 200**.
- All checks pass → `"ok"` and **HTTP 200**.

Critical checks are listed by **string key** (must match a `checks[].key`).

## Service identity (env)

The HTTP handler uses:

- **Service name:** `process.env.SERVICE_NAME`, or `"app"` if unset.
- **Version:** `process.env.SERVICE_VERSION`, then `process.env.npm_package_version`, then `"0.0.0"`.

Set these in your deployment so load balancers and dashboards see a stable identity.

## Implementing a check

Each check is a normal Nest **injectable** class that implements `HealthCheck`:

```typescript
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { HealthCheck, HealthCheckDetail } from '@momentco/nestjs-common';
import { rejectAfter } from '@momentco/nestjs-common';

const TIMEOUT_MS = 3_000;

@Injectable()
export class DatabaseHealthCheck implements HealthCheck {
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthCheckDetail> {
    const start = Date.now();
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        rejectAfter(TIMEOUT_MS, 'Database'),
      ]);
      return { status: 'ok', responseTimeMs: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'fail', responseTimeMs: null, error: message };
    }
  }
}
```

Guidelines:

- Return **`status: 'ok'`** or **`'fail'`** only; per-check detail does not use `"degraded"` (that is an aggregate-level concept).
- **`responseTimeMs`** should be `null` on failure if you did not measure a meaningful duration.
- **`error`** is optional on failure; useful for operators (keep messages short and safe).

## Nest usage

### `forRoot`

```typescript
import { Module } from '@nestjs/common';
import { HealthModule } from '@momentco/nestjs-common';
import { DatabaseHealthCheck } from './health/database.health';
import { RedisHealthCheck } from './health/redis.health';

@Module({
  imports: [
    HealthModule.forRoot({
      imports: [
        /* e.g. modules that export tokens your checks need */
      ],
      checks: [
        { key: 'database', useClass: DatabaseHealthCheck },
        { key: 'redis', useClass: RedisHealthCheck },
      ],
      criticalKeys: ['database'],
      path: 'health',
    }),
  ],
})
export class AppModule {}
```

- **`checks`:** Each `useClass` is registered as a provider in the dynamic module. Nest will inject constructor dependencies (e.g. `DataSource` from TypeORM) as long as those providers exist in the app.
- **`criticalKeys`:** Must be a subset of the `key` values you registered. Mismatch throws at startup (see `assertHealthModuleOptions`).
- **`path`:** HTTP path segment without a leading slash; default is `health` → `GET /health`.
- **`imports`:** Optional modules whose **exported** providers are visible to your check classes. Use this when a check needs a custom token (for example a Redis client bound to `HEALTH_REDIS_CLIENT`).

If a dependency is provided only in the root module and not exported, your checks may not see it. Prefer exporting a small module or using a `@Global()` module for shared tokens.

### `forRootAsync`

Use this when **`criticalKeys`** must come from async configuration (for example `ConfigService`). You still pass **`checks`** statically so Nest can register each class.

```typescript
HealthModule.forRootAsync({
  imports: [ConfigModule],
  checks: [
    { key: 'database', useClass: DatabaseHealthCheck },
    { key: 'redis', useClass: RedisHealthCheck },
  ],
  path: 'health',
  useFactory: (config: ConfigService) => ({
    criticalKeys: config.get<string>('HEALTH_CRITICAL_KEYS', 'database').split(','),
  }),
  inject: [ConfigService],
});
```

**Note:** `path` is fixed for `forRootAsync` via the **`path`** option on the static call (not from the factory). The factory only supplies **`criticalKeys`**.

## Response shape

Successful handler returns:

```json
{
  "status": "ok",
  "service": "my-service",
  "version": "1.0.0",
  "timestamp": "2026-04-03T12:00:00.000Z",
  "checks": {
    "database": { "status": "ok", "responseTimeMs": 3 },
    "redis": { "status": "ok", "responseTimeMs": 1 }
  }
}
```

On failure, a check may include `error`:

```json
{
  "status": "fail",
  "responseTimeMs": null,
  "error": "Connection refused"
}
```

## Custom or secondary endpoints

If you need a second route (for example internal vs public), you can keep using `aggregateHealth` and the shared types in your own controller while still reusing the same check classes.

## Testing

- **Unit tests:** Mock each `HealthCheck` with `useValue: { check: jest.fn() }` and register them as you would any provider, or test `aggregateHealth` directly with a fake `Record<string, HealthCheckDetail>`.
- **E2E:** Bootstrap `HealthModule.forRoot({ ... })` with a test app and `GET` the configured path.

In this repository, unit tests that mirror this document live under `test/unit/`: `health.module.spec.ts` (HTTP module, `forRoot` / `forRootAsync`, env identity, mocks), `aggregate-health.spec.ts`, `health.options.spec.ts` (`assertHealthModuleOptions`), `health.utils.spec.ts` (`rejectAfter`), `database.health.spec.ts`, `redis.health.spec.ts`, `pubsub.health.spec.ts`, `redis-health.module.spec.ts`, and `pubsub-health.module.spec.ts`.

## Related

- Source layout under `src/health/`:
  - `core/` — DTO/types, `aggregateHealth`, module options, `HEALTH_MODULE_OPTIONS`, `rejectAfter`
  - `http/` — `HealthAggregatorService`, `createHealthController`
  - `checks/` — built-in probes (`DatabaseHealthCheck`, `RedisHealthCheck`, `PubSubHealthCheck`, …)
  - `providers/` — `RedisHealthModule`, `PubSubHealthModule` (`register()` helpers)
  - `health.module.ts` — dynamic Nest module
  - `index.ts` — feature barrel re-exports
- `@nestjs/terminus` is not used. The HTTP controller adds OpenAPI metadata when `@nestjs/swagger` is installed (optional peer); otherwise decorators are no-ops.
