import { MomentLogger, createLogger } from '../../src/logging/logger.service';
import { runWithRequestId, getRequestId } from '../../src/logging/request-context';

describe('MomentLogger', () => {
  it('creates without throwing', () => {
    const logger = new MomentLogger({ service: 'test' });
    expect(logger).toBeDefined();
  });

  it('createLogger returns a winston logger', () => {
    const logger = createLogger({ service: 'test' });
    expect(typeof logger.info).toBe('function');
  });

  it('getRequestId returns undefined outside context', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('getRequestId returns value inside runWithRequestId', () => {
    runWithRequestId('test-id-123', () => {
      expect(getRequestId()).toBe('test-id-123');
    });
  });
});
