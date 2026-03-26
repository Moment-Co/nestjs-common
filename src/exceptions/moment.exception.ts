import { HttpException, HttpStatus } from '@nestjs/common';
import { MomentErrorCode } from './exception-types';

export interface MomentExceptionOptions {
  code: MomentErrorCode;
  message: string;
  statusCode: HttpStatus;
  cause?: unknown;
}

export class MomentException extends HttpException {
  public readonly code: MomentErrorCode;

  constructor(options: MomentExceptionOptions) {
    super(options.message, options.statusCode, { cause: options.cause });
    this.code = options.code;
  }
}

export class NotFoundException extends MomentException {
  constructor(message = 'Resource not found') {
    super({ code: MomentErrorCode.NOT_FOUND, message, statusCode: HttpStatus.NOT_FOUND });
  }
}

export class UnauthorizedException extends MomentException {
  constructor(message = 'Unauthorized') {
    super({ code: MomentErrorCode.UNAUTHORIZED, message, statusCode: HttpStatus.UNAUTHORIZED });
  }
}

export class ValidationException extends MomentException {
  constructor(message = 'Validation failed') {
    super({ code: MomentErrorCode.VALIDATION_ERROR, message, statusCode: HttpStatus.BAD_REQUEST });
  }
}

export class UpstreamServiceException extends MomentException {
  constructor(message = 'Upstream service error') {
    super({ code: MomentErrorCode.UPSTREAM_SERVICE_ERROR, message, statusCode: HttpStatus.BAD_GATEWAY });
  }
}
