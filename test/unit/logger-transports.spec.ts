import { createLogger } from '../../src/logging/logger.service';
import * as winston from 'winston';

describe('createLogger with extra transports', () => {
  const originalKService = process.env.K_SERVICE;

  afterEach(() => {
    if (originalKService === undefined) {
      delete process.env.K_SERVICE;
    } else {
      process.env.K_SERVICE = originalKService;
    }
  });

  it('includes only the console transport by default', () => {
    delete process.env.K_SERVICE;
    const logger = createLogger({ service: 'test' });
    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0]).toBeInstanceOf(winston.transports.Console);
  });

  it('appends additional transports', () => {
    delete process.env.K_SERVICE;
    const extra = new winston.transports.Console();
    const logger = createLogger({ service: 'test', transports: [extra] });
    expect(logger.transports).toHaveLength(2);
    expect(logger.transports[1]).toBe(extra);
  });

  it('filters out undefined entries from transports array', () => {
    delete process.env.K_SERVICE;
    const extra = new winston.transports.Console();
    const logger = createLogger({ service: 'test', transports: [undefined, extra, undefined] });
    expect(logger.transports).toHaveLength(2);
    expect(logger.transports[1]).toBe(extra);
  });

  it('omits the default Console transport in GCP when an explicit transport is provided', () => {
    process.env.K_SERVICE = 'test-service';
    const extra = new winston.transports.Console();
    const logger = createLogger({ service: 'test', transports: [extra] });
    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0]).toBe(extra);
  });

  it('still includes the default Console transport in GCP when no explicit transports are provided', () => {
    process.env.K_SERVICE = 'test-service';
    const logger = createLogger({ service: 'test' });
    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0]).toBeInstanceOf(winston.transports.Console);
  });

  it('still includes the default Console transport in GCP when transports array is all undefined', () => {
    process.env.K_SERVICE = 'test-service';
    const logger = createLogger({ service: 'test', transports: [undefined, undefined] });
    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0]).toBeInstanceOf(winston.transports.Console);
  });
});
