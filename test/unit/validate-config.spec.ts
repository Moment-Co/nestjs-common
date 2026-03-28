import { validateConfig } from '../../src/config/validate-config';
import { commonEnvSchema } from '../../src/config/common-env.schema';

describe('validateConfig', () => {
  it('passes with valid env', () => {
    const result = validateConfig(commonEnvSchema, {
      NODE_ENV: 'development',
      PORT: '3000',
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
    });
    expect(result.PORT).toBe('3000');
  });

  it('throws with missing DATABASE_URL', () => {
    expect(() =>
      validateConfig(commonEnvSchema, {
        NODE_ENV: 'development',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow('Config validation failed');
  });
});
