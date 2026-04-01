import { validateConfig } from '../../src/config/validate-config';
import { commonEnvSchema } from '../../src/config/common-env.schema';
import { databaseEnvSchema } from '../../src/config/database-env.schema';

describe('validateConfig', () => {
  it('passes with valid common env', () => {
    const result = validateConfig(commonEnvSchema, {
      NODE_ENV: 'development',
      PORT: '3000',
      LOG_LEVEL: 'info',
    });
    expect(result.PORT).toBe('3000');
  });

  it('throws with invalid NODE_ENV in common env', () => {
    expect(() =>
      validateConfig(commonEnvSchema, {
        NODE_ENV: 'invalid',
        PORT: '3000',
        LOG_LEVEL: 'info',
      }),
    ).toThrow('Config validation failed');
  });

  it('passes with valid database env', () => {
    const result = validateConfig(databaseEnvSchema, {
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USERNAME: 'user',
      DB_PASSWORD: 'pass',
      DB_NAME: 'mydb',
      DB_SSL: 'false',
      DB_POOL_MAX: '5',
      DB_POOL_MIN: '1',
      DB_POOL_IDLE_TIMEOUT_MS: '10000',
      DB_POOL_CONNECTION_TIMEOUT_MS: '5000',
      DB_RETRY_ATTEMPTS: '10',
      DB_RETRY_DELAY_MS: '3000',
    });
    expect(result.DB_HOST).toBe('localhost');
  });

  it('throws with missing DB_NAME in database env', () => {
    expect(() =>
      validateConfig(databaseEnvSchema, {
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USERNAME: 'user',
        DB_PASSWORD: 'pass',
      }),
    ).toThrow('Config validation failed');
  });
});
