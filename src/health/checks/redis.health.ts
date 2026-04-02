import { Inject, Injectable, Optional } from '@nestjs/common';
import type { HealthCheck } from '../core/health-check.interface';
import type { HealthCheckDetail } from '../core/types';
import { rejectAfter } from '../core/utils';

export const HEALTH_REDIS_CLIENT = Symbol('HEALTH_REDIS_CLIENT');

const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Minimal client surface for a Redis-style PING probe (for example `ioredis`).
 */
export interface RedisPingClient {
  ping(): Promise<string>;
}

/**
 * PING-based Redis check. Provide a client bound to {@link HEALTH_REDIS_CLIENT}
 * (for example an `ioredis` instance). If no client is registered, the check fails
 * with `"Redis not configured"` (use a non-critical key in {@link HealthModuleOptions.criticalKeys}
 * if Redis is optional for your service).
 */
@Injectable()
export class RedisHealthCheck implements HealthCheck {
  constructor(
    @Optional() @Inject(HEALTH_REDIS_CLIENT) private readonly redis?: RedisPingClient,
  ) {}

  async check(): Promise<HealthCheckDetail> {
    if (!this.redis) {
      return {
        status: 'fail',
        responseTimeMs: null,
        error: 'Redis not configured',
      };
    }

    const start = Date.now();
    try {
      await Promise.race([
        this.redis.ping(),
        rejectAfter(DEFAULT_TIMEOUT_MS, 'Redis'),
      ]);
      return { status: 'ok', responseTimeMs: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'fail', responseTimeMs: null, error: message };
    }
  }
}
