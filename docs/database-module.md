# Database module

Postgres only. Wraps `TypeOrmModule.forRoot` / `forRootAsync` with shared defaults.

## Prerequisites

- App installs **`@nestjs/typeorm`** (Nest 10 + TypeORM 0.3.x) plus this package’s peers: `@nestjs/common`, `@nestjs/core`, `typeorm`.
- Connection is always **host + port + credentials + database name** (no URL-only option in this helper).

## API surface

| Symbol | Role |
|--------|------|
| `DatabaseModule` | `forRoot(options)` / `forRootAsync({ useFactory, inject })` |
| `DatabaseModuleOptions` | Type for `options` / factory return value |
| `POSTGRES_DATABASE_DEFAULTS` | Readonly default policy object (spread in app, then override) |
| `buildPostgresTypeOrmOptions(options)` | Returns Nest `TypeOrmModuleOptions`; use if you call `TypeOrmModule.forRootAsync` yourself |
| `getPoolConfig(env?)` | Pool numbers only; `POSTGRES_DATABASE_DEFAULTS.pool` uses `getPoolConfig(process.env.NODE_ENV)` at **first import** of this package |

## `DatabaseModuleOptions` (required vs optional)

**Required**

- `host`, `port`, `username`, `password`, `database`, `entities` (string array, globs allowed)

**Optional** (override `POSTGRES_DATABASE_DEFAULTS` when set)

- `synchronize`, `ssl`, `pool`, `migrationsRun`, `retryAttempts`, `retryDelay`
- `migrations`, `migrationsTableName` (passed through to TypeORM only if defined)

**`PoolConfig` (library shape)**

- `max`, `min`, `idleTimeoutMs`, `connectionTimeoutMs`

`buildPostgresTypeOrmOptions` maps `pool` → TypeORM `extra` as `idleTimeoutMillis` / `connectionTimeoutMillis`. Partial `pool` in options is merged onto `POSTGRES_DATABASE_DEFAULTS.pool`.

**`ssl: true`** → TypeORM `ssl: { rejectUnauthorized: false }`.

## Init: `DatabaseModule.forRoot`

Use when config is synchronous (e.g. env already loaded).

```typescript
import { DatabaseModule } from '@momentco/nestjs-common';

@Module({
  imports: [
    DatabaseModule.forRoot({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
    }),
  ],
})
export class AppModule {}
```

## Init: `DatabaseModule.forRootAsync`

Use when config comes from a service (secrets, async config).

```typescript
DatabaseModule.forRootAsync({
  imports: [AppConfigModule],
  useFactory: (cfg: AppConfigService) => ({
    host: cfg.db.host,
    port: cfg.db.port,
    username: cfg.db.username,
    password: cfg.db.password,
    database: cfg.db.database,
    entities: [__dirname + '/**/*.entity{.ts,.js}'],
  }),
  inject: [AppConfigService],
});
```

## Defaults + overrides (recommended pattern)

1. Spread `POSTGRES_DATABASE_DEFAULTS`.
2. Spread a shallow override object (e.g. pool max, retries from app config).
3. Add connection + `entities` (+ `migrations` / `migrationsTableName` if used).

```typescript
import {
  POSTGRES_DATABASE_DEFAULTS,
  buildPostgresTypeOrmOptions,
  DatabaseModule,
} from '@momentco/nestjs-common';

// Option A — custom TypeOrmModule.forRootAsync
TypeOrmModule.forRootAsync({
  useFactory: (cfg: AppConfigService) =>
    buildPostgresTypeOrmOptions({
      ...POSTGRES_DATABASE_DEFAULTS,
      ...{
        pool: { max: cfg.db.pool.max, min: cfg.db.pool.min },
        retryAttempts: cfg.db.retryAttempts,
        retryDelay: cfg.db.retryDelay,
      },
      host: cfg.db.host,
      port: cfg.db.port,
      username: cfg.db.username,
      password: cfg.db.password,
      database: cfg.db.database,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
      migrationsTableName: 'migrations',
    }),
  inject: [AppConfigService],
});

// Option B — same shape via DatabaseModule.forRootAsync
DatabaseModule.forRootAsync({
  useFactory: (cfg: AppConfigService) => ({
    ...POSTGRES_DATABASE_DEFAULTS,
    ...{ pool: { max: cfg.db.pool.max }, retryAttempts: cfg.db.retryAttempts },
    host: cfg.db.host,
    port: cfg.db.port,
    username: cfg.db.username,
    password: cfg.db.password,
    database: cfg.db.database,
    entities: [__dirname + '/**/*.entity{.ts,.js}'],
  }),
  inject: [AppConfigService],
});
```

Map app config fields to **`idleTimeoutMs`** / **`connectionTimeoutMs`** when filling `pool` (not `idleTimeoutMillis`).

## `NODE_ENV` and `POSTGRES_DATABASE_DEFAULTS.pool`

`POSTGRES_DATABASE_DEFAULTS` is evaluated once when the module loads. If you need a pool tied to a specific env after startup, set `pool` explicitly in your merged options (or use `getPoolConfig('production')` when building that object).

## Exports

`DatabaseModule` re-exports **`TypeOrmModule`** so feature modules can use `TypeOrmModule.forFeature(...)` after importing `DatabaseModule`.
