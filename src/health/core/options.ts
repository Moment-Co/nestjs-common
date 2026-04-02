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
