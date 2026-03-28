import type { NextFunction, Request, Response } from 'express';
import { RequestIdMiddleware } from '../../src/middleware/request-id.middleware';
import { getRequestId } from '../../src/logging/request-context';

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('prefers inbound x-request-id and runs next inside ALS', (done) => {
    const req = {
      headers: { 'x-request-id': 'client-trace-1' },
    } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    const next: NextFunction = () => {
      try {
        expect(getRequestId()).toBe('client-trace-1');
        expect(setHeader).toHaveBeenCalledWith('x-request-id', 'client-trace-1');
        done();
      } catch (e) {
        done(e);
      }
    };

    middleware.use(req, res, next);
  });

  it('generates id when header missing and exposes it in ALS', (done) => {
    const req = { headers: {} } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;

    const next: NextFunction = () => {
      try {
        const id = getRequestId();
        expect(id).toBeDefined();
        expect(typeof id).toBe('string');
        expect(setHeader).toHaveBeenCalledWith('x-request-id', id);
        done();
      } catch (e) {
        done(e);
      }
    };

    middleware.use(req, res, next);
  });
});
