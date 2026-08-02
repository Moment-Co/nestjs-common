export type HealthCheckStatus = 'ok' | 'degraded' | 'fail';

export interface HealthCheckDetail {
  status: 'ok' | 'fail';
  responseTimeMs: number | null;
  error?: string;
}

export interface HealthCheckResponse {
  status: HealthCheckStatus;
  service: string;
  version: string;
  timestamp: string;
  checks: Record<string, HealthCheckDetail>;
  /**
   * Keys of failing checks (e.g. `['redis']`) — lets an operator or uptime
   * check read *which* dependency is down without parsing `checks`.
   */
  unhealthyServices: string[];
}

export interface AggregatedHealthResult {
  body: HealthCheckResponse;
  httpStatus: number;
}
