import { Test, TestingModule } from '@nestjs/testing';
import { RedisHealthModule } from '../../src/health/providers/redis-health.module';
import { HEALTH_REDIS_CLIENT } from '../../src/health/checks/redis.health';

function isIoredisResolvable(): boolean {
  try {
    require.resolve('ioredis');
    return true;
  } catch {
    return false;
  }
}

describe('RedisHealthModule', () => {
  const prevUrl = process.env.REDIS_URL;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prevUrl;
  });

  it('register() provides undefined client when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL;
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [RedisHealthModule.register()],
    }).compile();

    expect(moduleRef.get(HEALTH_REDIS_CLIENT)).toBeUndefined();
  });

  it('register({ url }) provides a lazy ioredis client when the package is installed', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RedisHealthModule.register({ url: 'redis://127.0.0.1:6379' })],
    }).compile();

    const client = moduleRef.get(HEALTH_REDIS_CLIENT);
    if (isIoredisResolvable()) {
      expect(client).toBeDefined();
      expect(typeof (client as { ping?: () => unknown }).ping).toBe('function');
    } else {
      expect(client).toBeUndefined();
    }
  });

  it('uses REDIS_URL from env when register() has no url option', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    const moduleRef = await Test.createTestingModule({
      imports: [RedisHealthModule.register()],
    }).compile();

    const client = moduleRef.get(HEALTH_REDIS_CLIENT);
    if (isIoredisResolvable()) {
      expect(client).toBeDefined();
    } else {
      expect(client).toBeUndefined();
    }
  });
});
