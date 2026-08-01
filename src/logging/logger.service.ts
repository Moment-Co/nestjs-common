import { Injectable, LoggerService as NestLoggerService, Optional } from '@nestjs/common';
import * as winston from 'winston';
import { getRequestId } from './request-context';

export interface LoggerOptions {
  service: string;
  level?: string;
  /** Extra Winston transports (e.g. GCP Cloud Logging). `undefined` entries are filtered out. */
  transports?: (winston.transport | undefined)[];
}

// Plain factory — usable outside NestJS (Cloud Functions, url-shortener)
export function createLogger(options: LoggerOptions): winston.Logger {
  const isDev = process.env.NODE_ENV !== 'production';
  const level = options.level ?? process.env.LOG_LEVEL ?? 'info';

  return winston.createLogger({
    level,
    defaultMeta: {
      service: options.service,
      environment: process.env.NODE_ENV ?? 'development',
    },
    format: isDev
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        )
      : winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
    transports: [
      new winston.transports.Console(),
      ...(options.transports ?? []).filter((t): t is winston.transport => !!t),
    ],
  });
}

/**
 * `context` accepts a plain string (classic Nest context) or a structured
 * args object — `logger.log('Static message', { userId, reason })` — which
 * winston merges into the log entry as metadata (nested under `context`,
 * matching the historical runtime behavior consumers already anchor metric
 * filters on).
 */
export type LogContext = string | Record<string, unknown>;

// NestJS wrapper
@Injectable()
export class MomentLogger implements NestLoggerService {
  private readonly logger: winston.Logger;

  constructor(@Optional() options?: LoggerOptions) {
    this.logger = createLogger(options ?? { service: 'unknown' });
  }

  private meta(): Record<string, unknown> {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  }

  log(message: string, context?: LogContext) {
    this.logger.info(message, { context, ...this.meta() });
  }

  error(message: string, trace?: unknown, context?: LogContext) {
    this.logger.error(message, { trace, context, ...this.meta() });
  }

  warn(message: string, context?: LogContext) {
    this.logger.warn(message, { context, ...this.meta() });
  }

  debug(message: string, context?: LogContext) {
    this.logger.debug(message, { context, ...this.meta() });
  }

  verbose(message: string, context?: LogContext) {
    this.logger.verbose(message, { context, ...this.meta() });
  }
}
