# Config module

Use Zod schemas from `@momentco/nestjs-common` to validate env once at startup.

## Exports

| Symbol | Role |
|--------|------|
| `commonEnvSchema` | Shared non-DB env keys |
| `databaseEnvSchema` | Standard DB env keys (only for DB services) |
| `validateConfig(schema, env?)` | Validates and returns typed config; throws on invalid env |

## `commonEnvSchema` keys

- `NODE_ENV`: `development | production | test` (default: `development`)
- `PORT`: numeric string (default: `3000`)
- `LOG_LEVEL`: `error | warn | info | debug | verbose` (default: `info`)
- `REDIS_URL`: URL string (required)

## `databaseEnvSchema` keys

- `DB_HOST` (required)
- `DB_PORT` (default: `5432`)
- `DB_USERNAME` (required)
- `DB_PASSWORD` (required)
- `DB_NAME` (required)
- `DB_SSL`: `true | false` (default: `false`)
- `DB_POOL_MAX` (default: `5`)
- `DB_POOL_MIN` (default: `1`)
- `DB_POOL_IDLE_TIMEOUT_MS` (default: `10000`)
- `DB_POOL_CONNECTION_TIMEOUT_MS` (default: `5000`)
- `DB_RETRY_ATTEMPTS` (default: `10`)
- `DB_RETRY_DELAY_MS` (default: `3000`)

## Validation patterns

### Non-DB service (exporter, worker without DB)

```typescript
import { commonEnvSchema, validateConfig } from '@momentco/nestjs-common';

export const env = validateConfig(commonEnvSchema);
```

### DB service (compose common + DB)

```typescript
import {
  commonEnvSchema,
  databaseEnvSchema,
  validateConfig,
} from '@momentco/nestjs-common';

const schema = commonEnvSchema.merge(databaseEnvSchema);
export const env = validateConfig(schema);
```

### Service-specific keys

```typescript
import { commonEnvSchema, validateConfig } from '@momentco/nestjs-common';
import { z } from 'zod';

const exporterSchema = commonEnvSchema.extend({
  EXPORTER_API_KEY: z.string().min(1),
  EXPORT_SOURCE_URL: z.string().url(),
});

export const env = validateConfig(exporterSchema);
```

## Convert string envs to runtime types

Schemas intentionally keep env values as strings (native process env shape). Convert at integration boundary:

```typescript
const port = Number(env.PORT);
const poolMax = Number(env.DB_POOL_MAX);
const retryDelayMs = Number(env.DB_RETRY_DELAY_MS);
```

## Failure behavior

`validateConfig` throws `Error` with message:

- starts with `Config validation failed:`
- includes per-field details (`path: message`)

Validate during app bootstrap so invalid env fails fast.

## Importer service scenarios

### Scenario A: importer uses DB + Redis + provider credentials

```typescript
import {
  commonEnvSchema,
  databaseEnvSchema,
  validateConfig,
} from '@momentco/nestjs-common';
import { z } from 'zod';

const importerSchema = commonEnvSchema.merge(databaseEnvSchema).extend({
  IMPORTER_PROVIDER_BASE_URL: z.string().url(),
  IMPORTER_PROVIDER_API_KEY: z.string().min(1),
  IMPORTER_BATCH_SIZE: z.string().regex(/^\d+$/).default('100'),
});

export const env = validateConfig(importerSchema);
```

### Scenario B: importer worker without DB

Use `commonEnvSchema` + worker-specific keys only.

```typescript
const workerSchema = commonEnvSchema.extend({
  IMPORTER_QUEUE_NAME: z.string().min(1),
});
```

### Scenario C: convert once, then export runtime config

```typescript
export const importerConfig = {
  port: Number(env.PORT),
  dbPort: Number(env.DB_PORT),
  batchSize: Number(env.IMPORTER_BATCH_SIZE),
};
```
