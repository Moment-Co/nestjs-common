import { Test, TestingModule } from '@nestjs/testing';
import {
  PubSubHealthCheck,
  HEALTH_PUBSUB_CLIENT,
} from '../../src/health/checks/pubsub.health';

describe('PubSubHealthCheck', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns fail when no client is bound', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PubSubHealthCheck],
    }).compile();

    const check = moduleRef.get(PubSubHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.error).toBe('Pub/Sub not configured');
  });

  it('returns ok when getTopics succeeds', async () => {
    const client = { getTopics: jest.fn().mockResolvedValue([['topic-1']]) }; // tuple like @google-cloud/pubsub

    const moduleRef = await Test.createTestingModule({
      providers: [
        PubSubHealthCheck,
        { provide: HEALTH_PUBSUB_CLIENT, useValue: client },
      ],
    }).compile();

    const check = moduleRef.get(PubSubHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('ok');
    expect(result.responseTimeMs).not.toBeNull();
    expect(client.getTopics).toHaveBeenCalledWith({ pageSize: 1 });
  });

  it('returns fail when getTopics rejects', async () => {
    const client = {
      getTopics: jest.fn().mockRejectedValue(new Error('PERMISSION_DENIED')),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PubSubHealthCheck,
        { provide: HEALTH_PUBSUB_CLIENT, useValue: client },
      ],
    }).compile();

    const check = moduleRef.get(PubSubHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.error).toBe('PERMISSION_DENIED');
  });

  it('returns fail when getTopics exceeds timeout', async () => {
    const client = {
      getTopics: jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([]), 60_000);
          }),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PubSubHealthCheck,
        { provide: HEALTH_PUBSUB_CLIENT, useValue: client },
      ],
    }).compile();

    const check = moduleRef.get(PubSubHealthCheck);
    const resultPromise = check.check();
    jest.advanceTimersByTime(3_000);
    const result = await resultPromise;

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/PubSub health check timed out after 3000ms/);
  });

  it('returns fail with Unknown error for non-Error rejections', async () => {
    const client = { getTopics: jest.fn().mockRejectedValue('string-error') };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PubSubHealthCheck,
        { provide: HEALTH_PUBSUB_CLIENT, useValue: client },
      ],
    }).compile();

    const check = moduleRef.get(PubSubHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.error).toBe('Unknown error');
  });
});
