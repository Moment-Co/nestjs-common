import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runWithRequestId } from '../logging/request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
    res.setHeader('x-request-id', requestId);
    runWithRequestId(requestId, () => next());
  }
}
