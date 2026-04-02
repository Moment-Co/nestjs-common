/**
 * Health feature — structured layout:
 * - `core/` — types, aggregation, module options, tokens, utils
 * - `http/` — HTTP controller and aggregator service
 * - `checks/` — built-in probes (database, redis, …)
 */

export type {
  HealthCheckStatus,
  HealthCheckDetail,
  HealthCheckResponse,
  AggregatedHealthResult,
} from './core/types';
export { aggregateHealth } from './core/aggregate-health';
export type { HealthCheck } from './core/health-check.interface';
export { HealthModule } from './health.module';
export { HealthAggregatorService } from './http/health-aggregator.service';
export { HEALTH_MODULE_OPTIONS } from './core/constants';
export type { HealthModuleOptions, HealthCheckRegistration } from './core/options';
export { assertHealthModuleOptions } from './core/options';
export { createHealthController } from './http/health.controller';
export { rejectAfter } from './core/utils';
export { DatabaseHealthCheck } from './checks/database.health';
export {
  RedisHealthCheck,
  HEALTH_REDIS_CLIENT,
  type RedisPingClient,
} from './checks/redis.health';
