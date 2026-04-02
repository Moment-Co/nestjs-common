import { Test, TestingModule } from '@nestjs/testing';
import {
  RedisHealthCheck,
  HEALTH_REDIS_CLIENT,
} from '../../src/health/checks/redis.health';

describe('RedisHealthCheck', () => {
  it('returns fail when no client is bound', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [RedisHealthCheck],
    }).compile();

    const check = moduleRef.get(RedisHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.error).toBe('Redis not configured');
  });

  it('returns ok when ping succeeds', async () => {
    const client = { ping: jest.fn().mockResolvedValue('PONG') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RedisHealthCheck,
        { provide: HEALTH_REDIS_CLIENT, useValue: client },
      ],
    }).compile();

    const check = moduleRef.get(RedisHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('ok');
    expect(result.responseTimeMs).not.toBeNull();
    expect(client.ping).toHaveBeenCalled();
  });

  it('returns fail when ping rejects', async () => {
    const client = { ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RedisHealthCheck,
        { provide: HEALTH_REDIS_CLIENT, useValue: client },
      ],
    }).compile();

    const check = moduleRef.get(RedisHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.error).toBe('ECONNREFUSED');
  });
});
