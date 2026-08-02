import { DataSource } from 'typeorm';
import { MomentLogger } from '../../src/logging/logger.service';
import { DatabasePoolMonitorService } from '../../src/database/database-pool-monitor.service';

// db_pool_checkout_failed / db_pool_checkout_waited are metric anchors:
// these tests pin the message strings and their attribute shape.

type ConnectCallback = (err: unknown, client: unknown, release: unknown) => void;

function makeFakePool(behavior: { err?: Error } = {}) {
  return {
    waitingCount: 3,
    totalCount: 10,
    idleCount: 0,
    options: { max: 10 },
    connect: jest.fn((...args: unknown[]) => {
      const callback = args[0];
      if (typeof callback === 'function') {
        (callback as ConnectCallback)(behavior.err, behavior.err ? undefined : 'client', 'release');
        return undefined;
      }
      return behavior.err ? Promise.reject(behavior.err) : Promise.resolve('client');
    }),
  };
}

function makeMonitor(pool: unknown, logger: unknown) {
  const dataSource = { driver: { master: pool } } as unknown as DataSource;
  const monitor = new DatabasePoolMonitorService(dataSource, logger as MomentLogger | undefined);
  monitor.onApplicationBootstrap();
  return monitor;
}

describe('DatabasePoolMonitorService', () => {
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    delete process.env.DB_POOL_WAIT_LOG_THRESHOLD_MS;
  });

  it('logs nothing for a fast successful checkout (callback style)', async () => {
    const pool = makeFakePool();
    makeMonitor(pool, logger);

    await new Promise<void>((resolve) => {
      pool.connect((err: unknown, client: unknown) => {
        expect(err).toBeUndefined();
        expect(client).toBe('client');
        resolve();
      });
    });

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('emits db_pool_checkout_waited with pool state when the wait exceeds the threshold', async () => {
    process.env.DB_POOL_WAIT_LOG_THRESHOLD_MS = '0';
    const pool = makeFakePool();
    makeMonitor(pool, logger);

    await (pool.connect() as Promise<unknown>);

    expect(logger.warn).toHaveBeenCalledWith('db_pool_checkout_waited', {
      waitedMs: expect.any(Number),
      waitingCount: 3,
      totalCount: 10,
      idleCount: 0,
      poolMax: 10,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('emits db_pool_checkout_failed with reason when a callback checkout fails', async () => {
    const pool = makeFakePool({ err: new Error('timeout exceeded when trying to connect') });
    makeMonitor(pool, logger);

    await new Promise<void>((resolve) => {
      pool.connect((err: unknown) => {
        expect(err).toBeInstanceOf(Error);
        resolve();
      });
    });

    expect(logger.error).toHaveBeenCalledWith('db_pool_checkout_failed', undefined, {
      waitedMs: expect.any(Number),
      waitingCount: 3,
      totalCount: 10,
      idleCount: 0,
      poolMax: 10,
      reason: 'timeout exceeded when trying to connect',
    });
  });

  it('emits db_pool_checkout_failed and still rejects the caller (promise style)', async () => {
    const pool = makeFakePool({ err: new Error('pool exhausted') });
    makeMonitor(pool, logger);

    await expect(pool.connect() as Promise<unknown>).rejects.toThrow('pool exhausted');
    // Settle handlers observe the same promise; flush the microtask queue.
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      'db_pool_checkout_failed',
      undefined,
      expect.objectContaining({ reason: 'pool exhausted' }),
    );
  });

  it('does not instrument the pool when no logger is registered', () => {
    const pool = makeFakePool();
    const originalConnect = pool.connect;
    makeMonitor(pool, undefined);

    expect(pool.connect).toBe(originalConnect);
  });

  it('tolerates a driver without a master pool', () => {
    const dataSource = { driver: {} } as unknown as DataSource;
    const monitor = new DatabasePoolMonitorService(dataSource, logger as unknown as MomentLogger);

    expect(() => monitor.onApplicationBootstrap()).not.toThrow();
  });
});
