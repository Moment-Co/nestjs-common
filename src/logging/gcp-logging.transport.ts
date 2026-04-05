import * as winston from 'winston';
import { GcpLoggingTransportOptions, isGcpEnvironment } from '../telemetry/telemetry.types';

/**
 * Creates a `@google-cloud/logging-winston` transport for structured log
 * export to Cloud Logging. Returns `undefined` when disabled or when the
 * package is not installed, so it can be spread safely into the transports
 * array of `LoggerOptions`.
 *
 * Required peer package: `@google-cloud/logging-winston`
 */
export function createGcpLoggingTransport(
  options?: GcpLoggingTransportOptions,
): winston.transport | undefined {
  const enabled = options?.enabled ?? isGcpEnvironment();
  if (!enabled) return undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LoggingWinston } = require('@google-cloud/logging-winston');
    return new LoggingWinston(
      options?.gcpProjectId ? { projectId: options.gcpProjectId } : undefined,
    );
  } catch {
    return undefined;
  }
}
