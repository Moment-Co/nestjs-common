import { DynamicModule, Module } from '@nestjs/common';
import { HEALTH_REDIS_CLIENT } from '../checks/redis.health';

export interface RedisHealthModuleOptions {
  /**
   * Redis connection URL. Defaults to `process.env.REDIS_URL`.
   */
  url?: string;
}

@Module({})
export class RedisHealthModule {
  /**
   * Registers the `HEALTH_REDIS_CLIENT` provider by creating an `ioredis`
   * instance. The library is loaded dynamically so it remains an optional
   * peer dependency.
   *
   * If the URL is not provided (either via options or env var) or the
   * library is not installed, the token resolves to `undefined` and
   * `RedisHealthCheck` reports "Redis not configured".
   */
  static register(options?: RedisHealthModuleOptions): DynamicModule {
    return {
      module: RedisHealthModule,
      providers: [
        {
          provide: HEALTH_REDIS_CLIENT,
          useFactory: () => {
            const url = options?.url ?? process.env.REDIS_URL?.trim();
            if (!url) return undefined;
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const Redis = require('ioredis').default ?? require('ioredis');
              return new Redis(url, {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                connectTimeout: 3_000,
                enableReadyCheck: false,
              });
            } catch {
              return undefined;
            }
          },
        },
      ],
      exports: [HEALTH_REDIS_CLIENT],
    };
  }
}
