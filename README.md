# @momentco/nestjs-common

Shared NestJS infrastructure library for Momentco services.

## What this package provides

- Structured logging with request-id context support
- Shared HTTP client with retries, profiles, and normalized errors
- Shared exception model and global exception filter
- Config validation utilities and standard env schemas
- Database module helpers for Postgres + TypeORM
- Request-id middleware
- GCP telemetry: OpenTelemetry tracing/metrics, Cloud Logging, Error Reporting, Cloud Profiler

## Install

```bash
pnpm add @momentco/nestjs-common
```

Ensure peer dependencies are installed in the consuming service (`@nestjs/common`, `@nestjs/core`, `typeorm`, and `@nestjs/typeorm` where DB module is used). **NestJS:** peers are declared for **v10 or v11** (`^10.0.0 || ^11.0.0`); use the `@nestjs/*` major that matches your app (e.g. `@nestjs/typeorm` 11 with Nest 11).

## Build and test (this repo)

```bash
pnpm install
pnpm run build
pnpm test
pnpm run test:integration
```

## Package entrypoints

Import from package root:

```typescript
import {
  LoggerModule,
  HttpClientModule,
  DatabaseModule,
  validateConfig,
  commonEnvSchema,
} from '@momentco/nestjs-common';
```

## Documentation index

- Config module: [`docs/config-module.md`](docs/config-module.md)
- Database module: [`docs/database-module.md`](docs/database-module.md)
- HTTP client module: [`docs/http-client-module.md`](docs/http-client-module.md)
- Logger module: [`docs/logger-module.md`](docs/logger-module.md)
- Exceptions module: [`docs/exceptions-module.md`](docs/exceptions-module.md)
- Telemetry module: [`docs/telemetry-module.md`](docs/telemetry-module.md)

## Typical integration order (new service)

1. Validate env with `commonEnvSchema` (+ `databaseEnvSchema` if needed)
2. Initialize `LoggerModule` and apply `RequestIdMiddleware`
3. Initialize `DatabaseModule` (if service uses DB)
4. Initialize `HttpClientModule` with named profiles for outbound dependencies
5. Register `MomentExceptionFilter` globally (or use `TelemetryModule` for GCP error reporting)
6. (Optional) Add `initTracing` and `startProfiler` for GCP APM

For concrete scenarios and code snippets, use the docs links above.
