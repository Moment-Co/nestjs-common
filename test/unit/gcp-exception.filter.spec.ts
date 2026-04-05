import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GcpExceptionFilter } from '../../src/telemetry/gcp-exception.filter';
import { GcpErrorReporter } from '../../src/telemetry/gcp-error-reporter';
import { MomentErrorCode } from '../../src/exceptions/exception-types';

function createMockHost(response: { status: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('GcpExceptionFilter', () => {
  let reporter: GcpErrorReporter;
  let filter: GcpExceptionFilter;

  beforeEach(() => {
    reporter = { report: jest.fn() } as unknown as GcpErrorReporter;
    filter = new GcpExceptionFilter(reporter);
  });

  it('reports 5xx errors to Cloud Error Reporting', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const error = new Error('something broke');

    filter.catch(error, createMockHost({ status }));

    expect(reporter.report).toHaveBeenCalledWith(error);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('does not report 4xx errors to Cloud Error Reporting', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const error = new HttpException('not found', HttpStatus.NOT_FOUND);

    filter.catch(error, createMockHost({ status }));

    expect(reporter.report).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('reports HttpException with 500+ status', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const error = new HttpException('bad gateway', HttpStatus.BAD_GATEWAY);

    filter.catch(error, createMockHost({ status }));

    expect(reporter.report).toHaveBeenCalledWith(error);
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
  });

  it('sends standard error response body from parent filter', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    filter.catch(new Error('oops'), createMockHost({ status }));

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: MomentErrorCode.INTERNAL_ERROR,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      }),
    );
  });
});
