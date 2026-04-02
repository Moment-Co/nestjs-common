import type { HealthCheckDetail } from './types';

/**
 * Implement this interface on injectable classes that perform a single
 * dependency health probe (database, Redis, Pub/Sub, etc.).
 */
export interface HealthCheck {
  check(): Promise<HealthCheckDetail>;
}
