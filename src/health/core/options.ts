import type { ModuleMetadata, Type } from '@nestjs/common';
import type { HealthCheck } from './health-check.interface';

export interface HealthCheckRegistration {
  /** Key in the JSON `checks` object (e.g. `database`, `redis`). */
  key: string;
  /** Injectable class implementing {@link HealthCheck}. */
  useClass: Type<HealthCheck>;
}

export interface HealthModuleOptions {
  checks: HealthCheckRegistration[];
  /**
   * Check keys that cause HTTP 503 when `status: "fail"`.
   * Non-listed failing checks yield overall `"degraded"` with HTTP 200.
   */
  criticalKeys: string[];
  /**
   * HTTP path for the controller (no leading slash).
   * @default 'health'
   */
  path?: string;
  /**
   * When set (e.g. `'readiness'`), splits the endpoints:
   *
   * - `path` becomes **liveness-only** — "is the process up", no dependency
   *   checks, always HTTP 200. The only endpoint that may ever influence
   *   platform restart behavior.
   * - `readinessPath` carries the registered dependency checks with the
   *   critical/degraded aggregation and `unhealthyServices[]`. Observation
   *   only — a slow datastore degrades readiness, it must never trigger
   *   instance recycling.
   *
   * The pair self-diagnoses: liveness failing ⇒ service down; liveness
   * passing + readiness failing ⇒ a datastore is down. When unset, `path`
   * keeps the legacy combined behavior.
   */
  readinessPath?: string;
  /**
   * Modules whose exported providers are visible to check classes (e.g. a module
   * that provides `HEALTH_REDIS_CLIENT` for a Redis check).
   */
  imports?: ModuleMetadata['imports'];
}

export function assertHealthModuleOptions(options: HealthModuleOptions): void {
  const keys = new Set(options.checks.map((c) => c.key));
  for (const k of options.criticalKeys) {
    if (!keys.has(k)) {
      throw new Error(
        `HealthModule: criticalKeys contains "${k}" but no check is registered with that key.`,
      );
    }
  }
}
