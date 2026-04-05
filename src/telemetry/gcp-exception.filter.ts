import { Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { MomentExceptionFilter } from '../exceptions/moment-exception.filter';
import { GcpErrorReporter } from './gcp-error-reporter';

/**
 * Extends `MomentExceptionFilter` to report server errors (5xx) to
 * Google Cloud Error Reporting. Register via `TelemetryModule.forRoot()`
 * instead of registering `MomentExceptionFilter` directly.
 */
@Catch()
export class GcpExceptionFilter extends MomentExceptionFilter {
  constructor(private readonly errorReporter: GcpErrorReporter) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
    }

    if (statusCode >= 500) {
      this.errorReporter.report(exception);
    }

    super.catch(exception, host);
  }
}
