import type {
  AggregatedHealthResult,
  HealthCheckDetail,
  HealthCheckStatus,
} from './types';

/**
 * Aggregates individual health-check results into a single response body
 * and HTTP status code using critical / non-critical rules.
 *
 * - Any **critical** key with `status: "fail"` → overall `"fail"` (HTTP 503).
 * - Any non-critical key with `status: "fail"` → overall `"degraded"` (HTTP 200).
 * - All pass → `"ok"` (HTTP 200).
 */
export function aggregateHealth(
  checks: Record<string, HealthCheckDetail>,
  criticalKeys: string[],
  service: string,
  version: string,
): AggregatedHealthResult {
  const criticalSet = new Set(criticalKeys);
  let hasCriticalFailure = false;
  let hasNonCriticalFailure = false;

  for (const [key, detail] of Object.entries(checks)) {
    if (detail.status === 'fail') {
      if (criticalSet.has(key)) {
        hasCriticalFailure = true;
      } else {
        hasNonCriticalFailure = true;
      }
    }
  }

  let status: HealthCheckStatus;
  let httpStatus: number;

  if (hasCriticalFailure) {
    status = 'fail';
    httpStatus = 503;
  } else if (hasNonCriticalFailure) {
    status = 'degraded';
    httpStatus = 200;
  } else {
    status = 'ok';
    httpStatus = 200;
  }

  return {
    body: {
      status,
      service,
      version,
      timestamp: new Date().toISOString(),
      checks,
    },
    httpStatus,
  };
}
