import {
  buildPostgresTypeOrmOptions,
  getPoolConfig,
  POSTGRES_DATABASE_DEFAULTS,
} from '../../src/database/database.config';

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
});
