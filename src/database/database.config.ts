import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

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

/**
 * Default TypeORM/Nest-related choices and pool sizing for Postgres.
 * `pool` uses {@link getPoolConfig} at module load (`NODE_ENV` at first import).
 *
 * In the app: `const policy = { ...POSTGRES_DATABASE_DEFAULTS, ...overrides }`, then pass
 * `{ ...policy, host, port, username, password, database, entities, migrations?, migrationsTableName? }`
 * to {@link buildPostgresTypeOrmOptions}. Partial `pool` overrides are merged with these defaults.
 */
export interface PostgresDatabaseDefaults {
  synchronize: boolean;
  /** When true, {@link buildPostgresTypeOrmOptions} maps to `ssl: { rejectUnauthorized: false }`. */
  ssl: boolean;
  pool: PoolConfig;
  migrationsRun: boolean;
  /** Matches Nest `TypeOrmModule` default retry behaviour unless overridden. */
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

/**
 * Connection, entities, optional migrations, plus any subset of {@link PostgresDatabaseDefaults}
 * (typically spread from {@link POSTGRES_DATABASE_DEFAULTS} and app overrides).
 */
type DatabasePolicyOverrides = Omit<PostgresDatabaseDefaults, 'pool'> & {
  pool: Partial<PoolConfig>;
};

export type DatabaseModuleOptions = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  entities: string[];
  migrations?: string[];
  migrationsTableName?: string;
} & Partial<DatabasePolicyOverrides>;

function poolToExtra(pool: PoolConfig): Record<string, number> {
  return {
    max: pool.max,
    min: pool.min,
    idleTimeoutMillis: pool.idleTimeoutMs,
    connectionTimeoutMillis: pool.connectionTimeoutMs,
  };
}

/**
 * Builds Nest `TypeOrmModuleOptions` for Postgres. Merges {@link POSTGRES_DATABASE_DEFAULTS} with
 * `options` for policy fields; `pool` is merged deeply so partial overrides keep remaining defaults.
 */
export function buildPostgresTypeOrmOptions(options: DatabaseModuleOptions): TypeOrmModuleOptions {
  const defaults = POSTGRES_DATABASE_DEFAULTS;
  const pool: PoolConfig = { ...defaults.pool, ...options.pool };
  const ssl = options.ssl ?? defaults.ssl;

  return {
    type: 'postgres',
    host: options.host,
    port: options.port,
    username: options.username,
    password: options.password,
    database: options.database,
    entities: options.entities,
    synchronize: options.synchronize ?? defaults.synchronize,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    extra: poolToExtra(pool),
    migrationsRun: options.migrationsRun ?? defaults.migrationsRun,
    retryAttempts: options.retryAttempts ?? defaults.retryAttempts,
    retryDelay: options.retryDelay ?? defaults.retryDelay,
    ...(options.migrations !== undefined ? { migrations: options.migrations } : {}),
    ...(options.migrationsTableName !== undefined
      ? { migrationsTableName: options.migrationsTableName }
      : {}),
  };
}
