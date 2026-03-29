import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { MomentException } from './moment.exception';
import { MomentErrorCode } from './exception-types';
import { getRequestId } from '../logging/request-context';

interface ErrorResponse {
  code: string;
  message: string;
  statusCode: number;
  requestId: string | undefined;
  timestamp: string;
}

@Catch()
export class MomentExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: string = MomentErrorCode.INTERNAL_ERROR;

    if (exception instanceof MomentException) {
      statusCode = exception.getStatus();
      message = exception.message;
      code = exception.code;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      message = exception.message;
      code = MomentErrorCode.INTERNAL_ERROR;
    }

    const body: ErrorResponse = {
      code,
      message,
      statusCode,
      requestId: getRequestId(),
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }
}
