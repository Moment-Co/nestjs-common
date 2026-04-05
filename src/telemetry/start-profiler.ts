import { ProfilerOptions, isGcpEnvironment } from './telemetry.types';

/**
 * Starts the Google Cloud Profiler agent. Call in `bootstrap()` before
 * `NestFactory.create()`.
 *
 * No-op when `enabled` resolves to false or when `@google-cloud/profiler`
 * is not installed.
 *
 * Required peer package: `@google-cloud/profiler`
 */
export async function startProfiler(options: ProfilerOptions): Promise<void> {
  const enabled = options.enabled ?? isGcpEnvironment();
  if (!enabled) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const profiler = require('@google-cloud/profiler');
    await profiler.start({
      serviceContext: {
        service: options.serviceName,
        version: options.serviceVersion ?? '0.0.0',
      },
    });
  } catch (err) {
    console.warn('Cloud Profiler failed to start:', err);
  }
}
