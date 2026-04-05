export interface TracingOptions {
  serviceName: string;
  /** Override GCP auto-detection. Defaults to true when `K_SERVICE` env var is set (Cloud Run). */
  enabled?: boolean;
  gcpProjectId?: string;
  serviceVersion?: string;
  /** Paths to exclude from HTTP auto-instrumentation (e.g. `/health`). */
  ignoreIncomingPaths?: (string | RegExp)[];
}

export interface ProfilerOptions {
  serviceName: string;
  /** Override GCP auto-detection. Defaults to true when `K_SERVICE` env var is set. */
  enabled?: boolean;
  serviceVersion?: string;
}

export interface ErrorReportingOptions {
  serviceName: string;
  /** Override GCP auto-detection. Defaults to true when `K_SERVICE` env var is set. */
  enabled?: boolean;
  gcpProjectId?: string;
}

export interface GcpLoggingTransportOptions {
  /** Override GCP auto-detection. Defaults to true when `K_SERVICE` env var is set. */
  enabled?: boolean;
  gcpProjectId?: string;
}

export function isGcpEnvironment(): boolean {
  return !!process.env.K_SERVICE;
}
