import { Inject, Injectable } from '@nestjs/common';
import { ErrorReportingOptions, isGcpEnvironment } from './telemetry.types';
import { TELEMETRY_OPTIONS } from './telemetry.constants';

/**
 * Thin wrapper around `@google-cloud/error-reporting`. When running outside
 * GCP (or when the package is not installed), `report()` is a no-op.
 */
@Injectable()
export class GcpErrorReporter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  constructor(@Inject(TELEMETRY_OPTIONS) options: ErrorReportingOptions) {
    const enabled = options.enabled ?? isGcpEnvironment();
    if (!enabled) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ErrorReporting } = require('@google-cloud/error-reporting');
      this.client = new ErrorReporting({
        projectId: options.gcpProjectId,
        reportMode: 'always',
        serviceContext: { service: options.serviceName },
      });
    } catch {
      // Package not installed — report() will be a no-op.
    }
  }

  report(error: unknown): void {
    if (!this.client) return;
    const err = error instanceof Error ? error : new Error(String(error));
    this.client.report(err);
  }
}
