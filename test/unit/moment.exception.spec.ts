import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { MomentExceptionFilter } from '../../src/exceptions/moment-exception.filter';
import { NotFoundException, ValidationException } from '../../src/exceptions/moment.exception';
import { MomentErrorCode } from '../../src/exceptions/exception-types';
import { runWithRequestId } from '../../src/logging/request-context';

function createMockHost(response: { status: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('MomentException', () => {
  it('NotFoundException carries NOT_FOUND and 404', () => {
    const e = new NotFoundException();
    expect(e.code).toBe(MomentErrorCode.NOT_FOUND);
    expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('ValidationException carries message and VALIDATION_ERROR', () => {
    const e = new ValidationException('bad input');
    expect(e.code).toBe(MomentErrorCode.VALIDATION_ERROR);
    expect(e.message).toBe('bad input');
  });
});

describe('MomentExceptionFilter', () => {
  it('serializes MomentException with code and status', () => {
    const filter = new MomentExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = createMockHost({ status });

    filter.catch(new NotFoundException('missing'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: MomentErrorCode.NOT_FOUND,
        message: 'missing',
        statusCode: 404,
      }),
    );
  });

  it('includes requestId from ALS when present', () => {
    const filter = new MomentExceptionFilter();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    runWithRequestId('req-from-als', () => {
      filter.catch(new HttpException('teapot', 418), createMockHost({ status }));
    });

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-from-als',
        statusCode: 418,
      }),
    );
  });
});
