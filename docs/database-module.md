# Database module — integration guide

This package gives you **one way** to configure **Postgres + TypeORM** across services: the same defaults (retries, pool → `extra`, SSL mapping), the same **env variable names** (`databaseEnvSchema`), and a short **`AppModule`** setup when you use **`DatabaseModule.forRootFromEnv`**.

**Scope:** Postgres only. No MySQL/SQLite helpers here.

---

## 1. Dependencies

Install in your service (versions must match your Nest major):

| Package | Role |
|---------|------|
| `@nestjs/typeorm` | Nest TypeORM integration |
| `typeorm` | `^0.3.x` |
| `@nestjs/common`, `@nestjs/core` | Nest peers |

Add **`@momentco/nestjs-common`**. Zod is used for env validation exported from this package.

---

## 2. End-to-end flow (what you will do)

Follow these steps once per app:

1. **Set environment variables** for the database (and any other keys your chosen Zod schema requires).
2. **Validate env** with `validateConfig(...)` so invalid config fails at startup with a clear error.
3. **Register `DatabaseModule`** in `AppModule` — usually with **`forRootFromEnv`** (see §4).
4. **Import `TypeOrmModule.forFeature`** in feature modules for your entities.

The library wires **`TypeOrmModule.forRoot`** (or async) internally and applies **`buildPostgresTypeOrmOptions`**, which merges **`POSTGRES_DATABASE_DEFAULTS`** and maps options to what TypeORM expects.

---

## 3. Environment variables

Database-related keys are defined by **`databaseEnvSchema`**. Full list and defaults live in [config-module.md](config-module.md#databaseenvschema-keys).

**Minimum you must set** (no default or empty):

- `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`

**Have defaults** (you may omit them if defaults are fine):

- `DB_PORT` (default `5432`)
- `DB_SSL` (`true` / `false`, default `false`)
- `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_IDLE_TIMEOUT_MS`, `DB_POOL_CONNECTION_TIMEOUT_MS`
- `DB_RETRY_ATTEMPTS`, `DB_RETRY_DELAY_MS`

If you merge **`commonEnvSchema.merge(databaseEnvSchema)`**, you must satisfy every key in both schemas (shared keys like **`NODE_ENV`**, **`PORT`**, **`LOG_LEVEL`**, plus all **`DB_*`**). For a **database-only** service that does not need the shared keys, validate **`databaseEnvSchema`** alone instead (Pattern B).

---

## 4. Recommended: `DatabaseModule.forRootFromEnv`

Use this when connection settings come from **validated env** and you only want to add **repo-specific paths** (entity/migration globs) and optional **overrides**.

### 4.1 Validate env

Pick **one** of these patterns.

**Pattern A — Shared platform env + DB (typical API service)**

```typescript
import {
  commonEnvSchema,
  databaseEnvSchema,
  validateConfig,
} from '@momentco/nestjs-common';

// Single schema: shared keys (NODE_ENV, PORT, LOG_LEVEL) + DB_*.
// validateConfig() reads process.env, validates, applies defaults, returns a typed object or throws.
const env = validateConfig(commonEnvSchema.merge(databaseEnvSchema));
```

**Pattern B — DB keys only (minimal env; no `commonEnvSchema` keys)**

```typescript
import { databaseEnvSchema, validateConfig } from '@momentco/nestjs-common';

const env = validateConfig(databaseEnvSchema);
```

`forRootFromEnv` needs the **`DatabaseEnv` slice** (all `DB_*` keys). Pattern A’s `env` is a superset and is valid as long as it includes those fields.

### 4.2 Register the module

Pass **three** arguments:

| Argument | Meaning |
|----------|---------|
| **1st** | Validated env object that includes **`DatabaseEnv`** (from step above). |
| **2nd — `layout`** | **`entities`** (required). Optional: **`migrations`**, **`migrationsTableName`**. Paths are **your** repo layout; this package cannot guess them. |
| **3rd — `overrides`** | Optional. Same shape as partial **`DatabaseModuleOptions`**. Use for things like a larger **`pool.max`** without changing env. **`pool`** is **deep-merged** with the pool built from env + library defaults. |

```typescript
import { Module } from '@nestjs/common';
import { DatabaseModule, validateConfig /* + schemas from 4.1 */ } from '@momentco/nestjs-common';

const env = validateConfig(/* your merged or database-only schema */);

@Module({
  imports: [
    DatabaseModule.forRootFromEnv(
      env,
      {
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
        migrationsTableName: 'migrations',
      },
      {
        pool: { max: 20 },
      },
    ),
  ],
})
export class AppModule {}
```

**What happens internally (so expectations are clear):**

1. **`databaseEnvToModuleOptions(env, layout)`** maps `DB_*` strings to numbers and booleans, sets **`ssl`** from `DB_SSL`, attaches **`entities`** / migrations from `layout`.
2. **`mergeDatabaseModuleOptions(base, overrides)`** applies your third argument; **`pool`** fields merge on top of env + **`POSTGRES_DATABASE_DEFAULTS.pool`** where relevant.
3. **`buildPostgresTypeOrmOptions`** produces final TypeORM options (see §8).

---

## 5. Feature modules: `TypeOrmModule.forFeature`

`DatabaseModule` **re-exports** **`TypeOrmModule`**. After `AppModule` imports `DatabaseModule`, register entities per feature module:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
})
export class OrdersModule {}
```

---

## 6. Choose how you bootstrap the DB

| Situation | Use |
|-----------|-----|
| Connection from **env** only, sync | **`DatabaseModule.forRootFromEnv`** (§4) |
| You build **`DatabaseModuleOptions`** yourself (sync), e.g. tests | **`DatabaseModule.forRoot({ ... })`** |
| Connection from **async** source (Secret Manager, `getDatabase()`) | **`DatabaseModule.forRootAsync`** with **`imports`**, **`inject`**, **`useFactory`** |
| You keep a **hand-written** `TypeOrmModule.forRootAsync` | Call **`buildPostgresTypeOrmOptions(...)`** inside `useFactory` so behavior matches other services |

### 6.1 `forRoot` (manual options, synchronous)

You pass a full **`DatabaseModuleOptions`** object (discrete fields **or** **`url`**, never both — see §7).

```typescript
DatabaseModule.forRoot({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
});
```

### 6.2 `forRootAsync` (async config, secrets)

**Always pass `imports`** for modules that provide tokens you inject (e.g. `AppConfigModule` → `AppConfigService`). The package forwards **`imports`** to **`TypeOrmModule.forRootAsync`**.

The factory must return **`DatabaseModuleOptions`** (discrete **or** `url` + `entities`). The module runs **`buildPostgresTypeOrmOptions`** on the result.

```typescript
DatabaseModule.forRootAsync({
  imports: [AppConfigModule],
  inject: [AppConfigService],
  useFactory: async (cfg: AppConfigService) => {
    const db = await cfg.getDatabase();
    return {
      ...(db.connectionUrl
        ? { url: db.connectionUrl }
        : {
            host: db.host,
            port: db.port,
            username: db.username,
            password: db.password,
            database: db.database,
          }),
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      pool: {
        max: db.pool.max,
        min: db.pool.min,
        idleTimeoutMs: db.pool.idleTimeoutMillis,
        connectionTimeoutMs: db.pool.connectionTimeoutMillis,
      },
      retryAttempts: db.retryAttempts,
      retryDelay: db.retryDelay,
    };
  },
});
```

Use **`idleTimeoutMs`** / **`connectionTimeoutMs`** in options; the builder maps them to TypeORM’s **`idleTimeoutMillis`** / **`connectionTimeoutMillis`** in **`extra`**.

---

## 7. Connection shape: discrete vs URL

**`DatabaseModuleOptions`** is a union:

- **Discrete:** `host`, `port`, `username`, `password`, `database`, `entities`, …
- **URL:** `url`, `entities`, …

**Do not** pass both **`url`** and discrete host fields. **`buildPostgresTypeOrmOptions`** throws if both appear.

**SSL:** For discrete connections, set **`ssl: true`** on options → TypeORM receives **`ssl: { rejectUnauthorized: false }`**. For **`url`**, prefer SSL parameters in the URL or set **`ssl`** explicitly if you need the same mapping.

---

## 8. What `POSTGRES_DATABASE_DEFAULTS` does

These values are **policy defaults** merged inside **`buildPostgresTypeOrmOptions`**. They are **not** host, user, password, or database name.

| Field | Value |
|-------|--------|
| `synchronize` | `false` |
| `ssl` | `false` (unless you override on options) |
| `migrationsRun` | `false` |
| `retryAttempts` | `10` |
| `retryDelay` | `3000` (ms) |
| `pool` | From **`getPoolConfig(process.env.NODE_ENV ?? 'development')`** at **first import** of this package |

**Default pool numbers** (when not overridden by env/options):

| Field | Non-`production` `NODE_ENV` | `production` |
|-------|-----------------------------|----------------|
| max | 5 | 10 |
| min | 1 | 2 |
| idleTimeoutMs | 10000 | 30000 |
| connectionTimeoutMs | 5000 | 5000 |

With **`forRootFromEnv`**, **`DB_POOL_*`** and **`DB_RETRY_*`** from env are applied in **`databaseEnvToModuleOptions`**, so they **replace** the numeric policy for pool/retry when building options. **`buildPostgresTypeOrmOptions`** still merges **`pool`** with **`POSTGRES_DATABASE_DEFAULTS.pool`** so partial overrides behave predictably.

---

## 9. Helpers and types (optional)

**Types:** **`DatabaseModuleOptions`** — discrete connection **or** `{ url, entities, ... }`; **`DatabaseModuleLayout`** — `entities` and optional migration paths; **`PoolConfig`** — `max` / `min` / `idleTimeoutMs` / `connectionTimeoutMs` for overrides.

| Export | When to use |
|--------|-------------|
| **`databaseEnvToModuleOptions(env, layout)`** | Custom wiring; same env → options mapping as **`forRootFromEnv`**. |
| **`mergeDatabaseModuleOptions(base, overrides?)`** | Same merge as the third argument to **`forRootFromEnv`** (deep-merge when `overrides.pool` is set). |
| **`buildPostgresTypeOrmOptions(options)`** | Hand-written **`TypeOrmModule.forRootAsync`**; keeps the same defaults as **`DatabaseModule`**. |
| **`getPoolConfig(nodeEnv?)`** | Pool numbers for a given env name (defaults use **`NODE_ENV`** at first import). |
| **`POSTGRES_DATABASE_DEFAULTS`** | Read or spread policy defaults in advanced setups. |

---

## 10. Migrations

- Pass **`migrations`** and **`migrationsTableName`** in **`layout`** (`forRootFromEnv`) or in **`DatabaseModuleOptions`**.
- Default **`migrationsRun`** is **`false`** — run migrations in CI/deploy, not silently at boot, unless you explicitly set **`migrationsRun: true`**.

---

## 11. Troubleshooting

| Problem | What to check |
|---------|----------------|
| **`AppConfigService`** undefined inside **`forRootAsync`** | **`imports: [AppConfigModule]`** (or the module that exports the service) must be present on **`forRootAsync`**. |
| Error about **url** and **discrete** together | Return only **`url`** **or** only host/port/user/password/database, not both. |
| Pool sizes unexpected | **`NODE_ENV`** at **first import** affects **`POSTGRES_DATABASE_DEFAULTS.pool`**; **`forRootFromEnv`** also sets pool from **`DB_POOL_*`**. Override explicitly in the third argument if needed. |
| **`validateConfig`** fails on missing **`DB_*`** | Ensure all required database env vars are set, or use **`databaseEnvSchema`** only if you do not merge with **`commonEnvSchema`**. |

---

## 12. Reference: `DatabaseModule` methods

| Method | Purpose |
|--------|---------|
| **`forRoot(options)`** | Sync; full **`DatabaseModuleOptions`**. |
| **`forRootFromEnv(env, layout, overrides?)** | Sync; env-driven discrete connection + layout + optional overrides. |
| **`forRootAsync({ imports?, useFactory, inject? })`** | Async factory returning **`DatabaseModuleOptions`**. |

All paths go through **`buildPostgresTypeOrmOptions`** before TypeORM sees the config.
