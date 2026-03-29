import {
  buildPostgresTypeOrmOptions,
  getPoolConfig,
  POSTGRES_DATABASE_DEFAULTS,
} from '../../src/database/database.config';
import { databaseEnvSchema } from '../../src/config/database-env.schema';
import { validateConfig } from '../../src/config/validate-config';

describe('database.config', () => {
  it('builds typeorm postgres options from required connection fields', () => {
    const result = buildPostgresTypeOrmOptions({
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'pass',
      database: 'app_db',
      entities: ['dist/**/*.entity.js'],
    });

    expect(result).toMatchObject({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'pass',
      database: 'app_db',
      entities: ['dist/**/*.entity.js'],
      synchronize: POSTGRES_DATABASE_DEFAULTS.synchronize,
      migrationsRun: POSTGRES_DATABASE_DEFAULTS.migrationsRun,
      retryAttempts: POSTGRES_DATABASE_DEFAULTS.retryAttempts,
      retryDelay: POSTGRES_DATABASE_DEFAULTS.retryDelay,
    });
  });

  it('deep-merges pool defaults with partial override', () => {
    const result = buildPostgresTypeOrmOptions({
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'pass',
      database: 'app_db',
      entities: ['dist/**/*.entity.js'],
      pool: { max: 42 },
    });

    expect(result.extra).toEqual({
      max: 42,
      min: POSTGRES_DATABASE_DEFAULTS.pool.min,
      idleTimeoutMillis: POSTGRES_DATABASE_DEFAULTS.pool.idleTimeoutMs,
      connectionTimeoutMillis: POSTGRES_DATABASE_DEFAULTS.pool.connectionTimeoutMs,
    });
  });

  it('maps ssl=true to rejectUnauthorized=false object', () => {
    const result = buildPostgresTypeOrmOptions({
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'pass',
      database: 'app_db',
      entities: ['dist/**/*.entity.js'],
      ssl: true,
    });

    expect(result).toMatchObject({ ssl: { rejectUnauthorized: false } });
  });

  it('exposes env-aware pool config helper', () => {
    expect(getPoolConfig('production')).toEqual({
      max: 10,
      min: 2,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 5000,
    });
    expect(getPoolConfig('development')).toEqual({
      max: 5,
      min: 1,
      idleTimeoutMs: 10000,
      connectionTimeoutMs: 5000,
    });
  });

  it('validates standardized DB env and maps to DatabaseModuleOptions shape', () => {
    const env = validateConfig(databaseEnvSchema, {
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USERNAME: 'postgres',
      DB_PASSWORD: 'secret',
      DB_NAME: 'momentco_platform',
      DB_SSL: 'true',
      DB_POOL_MAX: '3',
      DB_POOL_MIN: '0',
      DB_POOL_IDLE_TIMEOUT_MS: '30000',
      DB_POOL_CONNECTION_TIMEOUT_MS: '5000',
      DB_RETRY_ATTEMPTS: '10',
      DB_RETRY_DELAY_MS: '3000',
    });

    const result = buildPostgresTypeOrmOptions({
      host: env.DB_HOST,
      port: Number(env.DB_PORT),
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      entities: ['dist/**/*.entity.js'],
      ssl: env.DB_SSL === 'true',
      pool: {
        max: Number(env.DB_POOL_MAX),
        min: Number(env.DB_POOL_MIN),
        idleTimeoutMs: Number(env.DB_POOL_IDLE_TIMEOUT_MS),
        connectionTimeoutMs: Number(env.DB_POOL_CONNECTION_TIMEOUT_MS),
      },
      retryAttempts: Number(env.DB_RETRY_ATTEMPTS),
      retryDelay: Number(env.DB_RETRY_DELAY_MS),
    });

    expect(result).toMatchObject({
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'secret',
      database: 'momentco_platform',
      ssl: { rejectUnauthorized: false },
      retryAttempts: 10,
      retryDelay: 3000,
    });
    expect(result.extra).toEqual({
      max: 3,
      min: 0,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  });

  it('fails validation for non-numeric DB port', () => {
    expect(() =>
      validateConfig(databaseEnvSchema, {
        DB_HOST: 'localhost',
        DB_PORT: 'not-a-number',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'secret',
        DB_NAME: 'momentco_platform',
      }),
    ).toThrow('Config validation failed');
  });
});
