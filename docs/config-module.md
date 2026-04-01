# Config module — getting started

Validate **`process.env` once** at startup with **Zod** schemas from `@momentco/nestjs-common`. Invalid configuration fails fast with field-level errors instead of failing deep inside a service at runtime.

This doc is the **entry point** for env validation in your repo. For **Postgres + TypeORM** wiring after env is validated, see [database-module.md](database-module.md).

---

## What you install

Add **`@momentco/nestjs-common`** to your service. The package bundles **Zod** for schemas and `validateConfig`.

You do **not** need a separate `zod` install for the snippets below unless you extend schemas with `z` in your own files — then add **`zod`** as a direct dependency matching the version used by this package (see its `package.json`).

---

## Add env vars to your repo

1. **`.env`** (local) and **`.env.example`** (document required keys for teammates and CI).  
2. In **production**, set the same variable names on your platform (Kubernetes, Cloud Run, etc.).

The schemas below define **names and defaults** — your `.env.example` should list every key you rely on that has **no** default, and ideally all keys for clarity.

---

## Wire validation in your Nest app (four steps)

### Step 1 — Create a single env module file

Create something like **`src/config/env.ts`** (name is up to you). This file is the **only** place that calls `validateConfig` for the root schema.

```typescript
import {
  commonEnvSchema,
  databaseEnvSchema,
  validateConfig,
} from '@momentco/nestjs-common';

// Pick one pattern from § "Choose your schema" below.
const schema = commonEnvSchema.merge(databaseEnvSchema);

export const env = validateConfig(schema);
```

`validateConfig` reads **`process.env`** by default. You can pass a custom object as the second argument (e.g. for tests).

### Step 2 — Import `env` where you need typed config

Use **`env.PORT`**, **`env.DB_HOST`**, etc. Types come from the schema you merged (`CommonEnv`, `DatabaseEnv`, or your extended type).

```typescript
import { env } from './config/env';

const port = Number(env.PORT);
```

Keep values as **strings** in `env` where the schema uses strings; convert to `number` / `boolean` at the boundary where you pass them to libraries (see § "Strings vs numbers").

### Step 3 — Load `.env` before Nest boots (local dev)

Use **`@nestjs/config`** `ConfigModule.forRoot()` or **`dotenv/config`** at the very top of **`main.ts`** so `process.env` is populated **before** `env.ts` is evaluated:

```typescript
// main.ts — first lines
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
// ...
```

If `validateConfig` runs before dotenv loads, required vars will be missing and validation will throw.

### Step 4 — Fail fast in `main.ts` (optional but recommended)

Either rely on **import order** (importing `./config/env` before creating the app) or call validation explicitly so the process exits before listening:

```typescript
import './config/env'; // runs validateConfig on import
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
```

---

## Choose your schema

| Your service | Schema to use |
|--------------|----------------|
| HTTP API with shared defaults + Postgres | `commonEnvSchema.merge(databaseEnvSchema)` |
| No database (worker, exporter) | `commonEnvSchema` only, or `commonEnvSchema.extend({ ... })` |
| Database only (no `NODE_ENV` / `PORT` from common) | `databaseEnvSchema` only — see [database-module.md](database-module.md) Pattern B |
| Redis, queues, third-party URLs | `commonEnvSchema.merge(...).extend({ REDIS_URL: z.string().url(), ... })` or merge a small local `z.object({ ... })` |

**Example — common + DB (typical API):**

```typescript
import {
  commonEnvSchema,
  databaseEnvSchema,
  validateConfig,
} from '@momentco/nestjs-common';

export const env = validateConfig(commonEnvSchema.merge(databaseEnvSchema));
```

**Example — common + DB + Redis in your repo:**

```typescript
import {
  commonEnvSchema,
  databaseEnvSchema,
  validateConfig,
} from '@momentco/nestjs-common';
import { z } from 'zod';

const schema = commonEnvSchema.merge(databaseEnvSchema).extend({
  REDIS_URL: z.string().url(),
});

export const env = validateConfig(schema);
```

**Example — service-specific keys only (extends common):**

```typescript
import { commonEnvSchema, validateConfig } from '@momentco/nestjs-common';
import { z } from 'zod';

const schema = commonEnvSchema.extend({
  EXPORTER_API_KEY: z.string().min(1),
  EXPORT_SOURCE_URL: z.string().url(),
});

export const env = validateConfig(schema);
```

---

## API reference

| Export | Purpose |
|--------|---------|
| `validateConfig(schema, env?)` | Parses `env` (default `process.env`), returns typed result or throws |
| `commonEnvSchema` | Zod object: `NODE_ENV`, `PORT`, `LOG_LEVEL` |
| `databaseEnvSchema` | Zod object: standard `DB_*` keys for Postgres services |
| `CommonEnv` | TypeScript type: `z.infer<typeof commonEnvSchema>` |
| `DatabaseEnv` | TypeScript type: `z.infer<typeof databaseEnvSchema>` |

---

## `commonEnvSchema` keys

| Key | Notes |
|-----|--------|
| `NODE_ENV` | `development` \| `production` \| `test` — default `development` |
| `PORT` | Numeric string — default `3000` |
| `LOG_LEVEL` | `error` \| `warn` \| `info` \| `debug` \| `verbose` — default `info` |

Redis, queues, and other integrations are **not** included. Add them with `.extend({ ... })` in your service.

---

## `databaseEnvSchema` keys

| Key | Required | Default |
|-----|----------|---------|
| `DB_HOST` | yes | — |
| `DB_PORT` | no | `5432` |
| `DB_USERNAME` | yes | — |
| `DB_PASSWORD` | yes | — |
| `DB_NAME` | yes | — |
| `DB_SSL` | no | `false` (`'true'` / `'false'`) |
| `DB_POOL_MAX` | no | `5` |
| `DB_POOL_MIN` | no | `1` |
| `DB_POOL_IDLE_TIMEOUT_MS` | no | `10000` |
| `DB_POOL_CONNECTION_TIMEOUT_MS` | no | `5000` |
| `DB_RETRY_ATTEMPTS` | no | `10` |
| `DB_RETRY_DELAY_MS` | no | `3000` |

Use these with [database-module.md](database-module.md) **`DatabaseModule.forRootFromEnv`** so you do not map each key by hand.

---

## Strings vs numbers

Env vars are **strings** in `process.env`. Schemas keep them as strings where appropriate (`PORT`, `DB_PORT`, pool settings). Convert when calling APIs that need numbers:

```typescript
const port = Number(env.PORT);
const poolMax = Number(env.DB_POOL_MAX);
const retryDelayMs = Number(env.DB_RETRY_DELAY_MS);
```

---

## When validation fails

`validateConfig` throws an **`Error`** whose message:

- starts with `Config validation failed:`
- lists each Zod issue with `path` and `message`

Fix the env (local `.env` or deployment config) and restart. Do not catch this in production unless you have a dedicated fallback — usually you want the process to exit.

---

## Full example: importer-style schema

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

Optional: derive a **runtime config object** once:

```typescript
export const importerRuntimeConfig = {
  port: Number(env.PORT),
  dbPort: Number(env.DB_PORT),
  batchSize: Number(env.IMPORTER_BATCH_SIZE),
};
```

---

## Related docs

- [database-module.md](database-module.md) — `DatabaseModule.forRootFromEnv`, `databaseEnvSchema`, TypeORM defaults  
- [logger-module.md](logger-module.md) — logging and `LOG_LEVEL` usage in apps
