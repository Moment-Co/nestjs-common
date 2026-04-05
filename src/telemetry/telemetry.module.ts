import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorReportingOptions } from './telemetry.types';
import { GcpErrorReporter } from './gcp-error-reporter';
import { GcpExceptionFilter } from './gcp-exception.filter';
import { TELEMETRY_OPTIONS } from './telemetry.constants';

/**
 * Registers Cloud Error Reporting and the `GcpExceptionFilter` globally.
 *
 * When using this module, do **not** separately register
 * `MomentExceptionFilter` — `GcpExceptionFilter` extends it and handles
 * both the standard error response and GCP error reporting.
 */
@Module({})
export class TelemetryModule {
  static forRoot(options: ErrorReportingOptions): DynamicModule {
    return {
      module: TelemetryModule,
      providers: [
        { provide: TELEMETRY_OPTIONS, useValue: options },
        GcpErrorReporter,
        { provide: APP_FILTER, useClass: GcpExceptionFilter },
      ],
      exports: [GcpErrorReporter],
      global: true,
    };
  }
}
