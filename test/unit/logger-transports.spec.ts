import { createLogger } from '../../src/logging/logger.service';
import * as winston from 'winston';

describe('createLogger with extra transports', () => {
  it('includes only the console transport by default', () => {
    const logger = createLogger({ service: 'test' });
    expect(logger.transports).toHaveLength(1);
    expect(logger.transports[0]).toBeInstanceOf(winston.transports.Console);
  });

  it('appends additional transports', () => {
    const extra = new winston.transports.Console();
    const logger = createLogger({ service: 'test', transports: [extra] });
    expect(logger.transports).toHaveLength(2);
    expect(logger.transports[1]).toBe(extra);
  });

  it('filters out undefined entries from transports array', () => {
    const extra = new winston.transports.Console();
    const logger = createLogger({ service: 'test', transports: [undefined, extra, undefined] });
    expect(logger.transports).toHaveLength(2);
    expect(logger.transports[1]).toBe(extra);
  });
});
