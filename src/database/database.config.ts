import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DatabaseEnv } from '../config/database-env.schema';

export interface PoolConfig {
  max: number;
  min: number;
  idleTimeoutMs: number;
  connectionTimeoutMs: number;
}

export function getPoolConfig(env: string = process.env.NODE_ENV ?? 'development'): PoolConfig {
  const isProd = env === 'production';
  return {
    max: isProd ? 10 : 5,
    min: isProd ? 2 : 1,
    idleTimeoutMs: isProd ? 30000 : 10000,
    connectionTimeoutMs: 5000,
  };
}

interface PostgresDatabaseDefaults {
  synchronize: boolean;
  ssl: boolean;
  pool: PoolConfig;
  migrationsRun: boolean;
  retryAttempts: number;
  retryDelay: number;
}

export const POSTGRES_DATABASE_DEFAULTS: PostgresDatabaseDefaults = {
  synchronize: false,
  ssl: false,
  pool: getPoolConfig(process.env.NODE_ENV ?? 'development'),
  migrationsRun: false,
  retryAttempts: 10,
  retryDelay: 3000,
};

type DatabasePolicyOverrides = Omit<PostgresDatabaseDefaults, 'pool'> & {
  pool: Partial<PoolConfig>;
};

type DatabaseModuleOptionsDiscrete = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  entities: string[];
  migrations?: string[];
  migrationsTableName?: string;
  /**
   * Postgres `application_name` for this service's connections — makes them
   * attributable in `pg_stat_activity`, the prerequisite for per-service
   * connection monitoring on a shared instance. Takes precedence over an
   * `application_name` query param in a connection URL.
   */
  applicationName?: string;
  /**
   * Extra pg driver options merged into TypeORM's `extra`, on top of the pool
   * settings this module derives from `pool` (e.g. `statement_timeout`).
   * Pool-owned keys (max, min, idleTimeoutMillis, connectionTimeoutMillis) are
   * rejected — set those through `pool`.
   */
  extra?: Record<string, unknown>;
} & Partial<DatabasePolicyOverrides>;

type DatabaseModuleOptionsUrl = {
  url: string;
  entities: string[];
  migrations?: string[];
  migrationsTableName?: string;
  /** See `DatabaseModuleOptionsDiscrete.applicationName`. */
  applicationName?: string;
  /** See `DatabaseModuleOptionsDiscrete.extra`. */
  extra?: Record<string, unknown>;
} & Partial<DatabasePolicyOverrides>;

/** Discrete connection or `url` + `entities`; never both connection styles. */
export type DatabaseModuleOptions = DatabaseModuleOptionsDiscrete | DatabaseModuleOptionsUrl;

export type DatabaseModuleLayout = {
  entities: string[];
  migrations?: string[];
  migrationsTableName?: string;
};

function poolToExtra(pool: PoolConfig): Record<string, number> {
  return {
    max: pool.max,
    min: pool.min,
    idleTimeoutMillis: pool.idleTimeoutMs,
    connectionTimeoutMillis: pool.connectionTimeoutMs,
  };
}

/** Driver `extra` keys owned by `pool` — callers must not set these directly. */
const POOL_OWNED_EXTRA_KEYS = [
  'max',
  'min',
  'idleTimeoutMillis',
  'connectionTimeoutMillis',
] as const;

/**
 * Pool sizing is the module's contract — a caller silently overriding `max` via
 * `extra` would defeat the per-service connection budget without any signal.
 * Collisions are rejected rather than merged in either direction.
 */
function assertExtraDoesNotOverridePool(extra?: Record<string, unknown>): void {
  if (!extra) return;
  const collisions = POOL_OWNED_EXTRA_KEYS.filter((key) => key in extra);
  if (collisions.length > 0) {
    throw new Error(
      `DatabaseModuleOptions.extra must not set pool-owned keys (${collisions.join(', ')}); use pool instead`,
    );
  }
}

function assertConnectionMode(options: DatabaseModuleOptions): void {
  const hasUrl = 'url' in options && options.url !== undefined && options.url !== '';
  const hasDiscrete =
    'host' in options &&
    (options as DatabaseModuleOptionsDiscrete).host !== undefined &&
    (options as DatabaseModuleOptionsDiscrete).host !== '';
  if (hasUrl && hasDiscrete) {
    throw new Error(
      'DatabaseModuleOptions: provide either url or discrete host/port/username/password/database, not both',
    );
  }
  if (!hasUrl && !hasDiscrete) {
    throw new Error(
      'DatabaseModuleOptions: provide either url or discrete host, port, username, password, database',
    );
  }
}

/** Maps `DatabaseEnv` + layout to discrete options (same mapping as `DatabaseModule.forRootFromEnv`). */
export function databaseEnvToModuleOptions(
  env: DatabaseEnv,
  layout: DatabaseModuleLayout,
): DatabaseModuleOptionsDiscrete {
  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: layout.entities,
    ...(layout.migrations !== undefined ? { migrations: layout.migrations } : {}),
    ...(layout.migrationsTableName !== undefined
      ? { migrationsTableName: layout.migrationsTableName }
      : {}),
    ssl: env.DB_SSL === 'true',
    pool: {
      max: Number(env.DB_POOL_MAX),
      min: Number(env.DB_POOL_MIN),
      idleTimeoutMs: Number(env.DB_POOL_IDLE_TIMEOUT_MS),
      connectionTimeoutMs: Number(env.DB_POOL_CONNECTION_TIMEOUT_MS),
    },
    retryAttempts: Number(env.DB_RETRY_ATTEMPTS),
    retryDelay: Number(env.DB_RETRY_DELAY_MS),
  };
}

/**
 * Shallow merge of `overrides` onto `base`; when `overrides.pool` is set, deep-merges `pool`
 * with `POSTGRES_DATABASE_DEFAULTS.pool` and `base.pool`.
 */
export function mergeDatabaseModuleOptions(
  base: DatabaseModuleOptions,
  overrides?: Partial<DatabaseModuleOptions>,
): DatabaseModuleOptions {
  if (!overrides) return base;
  let merged = { ...base, ...overrides } as DatabaseModuleOptions;
  if (overrides.extra !== undefined) {
    // Deep-merge like `pool`: a partial override must not drop keys the base set.
    merged = {
      ...merged,
      extra: { ...(base.extra ?? {}), ...overrides.extra },
    } as DatabaseModuleOptions;
  }
  if (overrides.pool === undefined) {
    return merged;
  }
  return {
    ...merged,
    pool: {
      ...POSTGRES_DATABASE_DEFAULTS.pool,
      ...('pool' in base && base.pool ? base.pool : {}),
      ...overrides.pool,
    },
  } as DatabaseModuleOptions;
}

/** Nest TypeORM options for Postgres; merges `POSTGRES_DATABASE_DEFAULTS`, discrete or `url` connection. */
export function buildPostgresTypeOrmOptions(options: DatabaseModuleOptions): TypeOrmModuleOptions {
  assertConnectionMode(options);
  assertExtraDoesNotOverridePool(options.extra);
  const defaults = POSTGRES_DATABASE_DEFAULTS;
  const pool: PoolConfig = { ...defaults.pool, ...options.pool };
  const ssl = options.ssl ?? defaults.ssl;

  const baseOrm = {
    type: 'postgres' as const,
    entities: options.entities,
    synchronize: options.synchronize ?? defaults.synchronize,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    extra: { ...poolToExtra(pool), ...(options.extra ?? {}) },
    migrationsRun: options.migrationsRun ?? defaults.migrationsRun,
    retryAttempts: options.retryAttempts ?? defaults.retryAttempts,
    retryDelay: options.retryDelay ?? defaults.retryDelay,
    ...(options.applicationName !== undefined
      ? { applicationName: options.applicationName }
      : {}),
    ...(options.migrations !== undefined ? { migrations: options.migrations } : {}),
    ...(options.migrationsTableName !== undefined
      ? { migrationsTableName: options.migrationsTableName }
      : {}),
  };

  if ('url' in options && options.url !== undefined && options.url !== '') {
    return {
      ...baseOrm,
      url: options.url,
    };
  }

  const d = options as DatabaseModuleOptionsDiscrete;
  return {
    ...baseOrm,
    host: d.host,
    port: d.port,
    username: d.username,
    password: d.password,
    database: d.database,
  };
}
