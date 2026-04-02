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
}

export interface AggregatedHealthResult {
  body: HealthCheckResponse;
  httpStatus: number;
}
