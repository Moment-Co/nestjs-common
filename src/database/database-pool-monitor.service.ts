import { Injectable, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MomentLogger } from '../logging/logger.service';

/**
 * Structural view of a `pg` Pool — only the members this monitor touches, so
 * we don't depend on TypeORM's postgres driver internals being exported.
 */
interface PgPoolLike {
  connect: (...args: unknown[]) => unknown;
  waitingCount?: number;
  totalCount?: number;
  idleCount?: number;
  options?: { max?: number };
}

/** Successful checkouts slower than this emit `db_pool_checkout_waited`. */
export const DB_POOL_WAIT_LOG_THRESHOLD_MS_DEFAULT = 1000;

/**
 * Emits static, countable log lines when a Postgres pool checkout waits or
 * fails — the seam log-based metrics cannot otherwise see (a checkout timeout
 * rejects the caller's promise without any pool event).
 *
 * Log lines (metric anchors — renaming a message or its attributes must
 * update the corresponding Cloud Logging metric filter in the same PR):
 *
 * - `db_pool_checkout_failed`  — a checkout rejected (e.g. connection
 *   timeout, pool exhausted + timeout). Any sustained occurrence is
 *   alert-worthy: callers are being starved of connections.
 * - `db_pool_checkout_waited`  — a checkout succeeded but took longer than
 *   the threshold (`DB_POOL_WAIT_LOG_THRESHOLD_MS`, default 1000ms). The
 *   wait includes new-client connection setup, which is exactly the latency
 *   the caller experienced.
 *
 * Both carry `{waitedMs, waitingCount, totalCount, idleCount, poolMax}` so a
 * single line answers "was the pool exhausted or the database slow?".
 *
 * Implementation: wraps `pool.connect` on the TypeORM postgres driver's
 * master (and any replica) pools after TypeORM initializes. Both the
 * callback and promise call styles are preserved. No-ops when `MomentLogger`
 * isn't registered (an unlogged monitor is useless — and must never break
 * the connection path).
 */
@Injectable()
export class DatabasePoolMonitorService implements OnApplicationBootstrap {
  private readonly waitThresholdMs: number = Number(
    process.env.DB_POOL_WAIT_LOG_THRESHOLD_MS ?? DB_POOL_WAIT_LOG_THRESHOLD_MS_DEFAULT,
  );

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly logger?: MomentLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.logger) return;
    const driver = this.dataSource.driver as unknown as {
      master?: PgPoolLike;
      slaves?: PgPoolLike[];
    };
    const pools = [driver.master, ...(driver.slaves ?? [])].filter(
      (pool): pool is PgPoolLike => pool !== undefined && typeof pool.connect === 'function',
    );
    for (const pool of pools) this.instrumentPool(pool);
  }

  private instrumentPool(pool: PgPoolLike): void {
    const originalConnect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;
    const settle = (err: unknown, startedAt: number): void =>
      this.recordCheckoutSettled(pool, err, Date.now() - startedAt);

    pool.connect = (...args: unknown[]): unknown => {
      const startedAt = Date.now();
      const callback = args[0];

      // Callback style (what TypeORM's postgres driver uses).
      if (typeof callback === 'function') {
        return originalConnect((err: unknown, client: unknown, release: unknown) => {
          settle(err, startedAt);
          (callback as (...cbArgs: unknown[]) => void)(err, client, release);
        });
      }

      // Promise style. The original promise is returned untouched; our
      // handlers only observe it.
      const result = originalConnect(...args) as Promise<unknown>;
      result.then(
        () => settle(undefined, startedAt),
        (err: unknown) => settle(err, startedAt),
      );
      return result;
    };
  }

  private recordCheckoutSettled(pool: PgPoolLike, err: unknown, waitedMs: number): void {
    const poolState = {
      waitedMs,
      waitingCount: pool.waitingCount,
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      poolMax: pool.options?.max,
    };

    if (err !== undefined && err !== null) {
      this.logger?.error('db_pool_checkout_failed', undefined, {
        ...poolState,
        reason: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (waitedMs >= this.waitThresholdMs) {
      this.logger?.warn('db_pool_checkout_waited', poolState);
    }
  }
}
