// Database
export { DatabaseModule } from './database/database.module';
export {
  buildPostgresTypeOrmOptions,
  databaseEnvToModuleOptions,
  mergeDatabaseModuleOptions,
  DatabaseModuleLayout,
  DatabaseModuleOptions,
  getPoolConfig,
  PoolConfig,
  POSTGRES_DATABASE_DEFAULTS,
} from './database/database.config';

// HTTP Client
export { HttpClientModule } from './http-client/http-client.module';
export {
  createHttpClient,
  CircuitBreakerPolicy,
  HttpClientOptions,
  HttpClientService,
  HttpLogHook,
  HttpMetricsHook,
  NamedHttpClientProfile,
  RequestOptions,
} from './http-client/http-client.service';
export { ExternalHttpError, HttpClientException, HttpErrorType } from './http-client/http-client.exception';

// Logging — NestJS
export { LoggerModule } from './logging/logger.module';
export { MomentLogger, LoggerOptions } from './logging/logger.service';

// Logging — Plain (for non-NestJS consumers)
export { createLogger } from './logging/logger.service';
export { getRequestId, runWithRequestId, requestContextStorage } from './logging/request-context';

// Exceptions
export { MomentExceptionFilter } from './exceptions/moment-exception.filter';
export {
  MomentException,
  NotFoundException,
  UnauthorizedException,
  ValidationException,
  UpstreamServiceException,
} from './exceptions/moment.exception';
export { MomentErrorCode } from './exceptions/exception-types';

// Config
export { commonEnvSchema, CommonEnv } from './config/common-env.schema';
export { databaseEnvSchema, DatabaseEnv } from './config/database-env.schema';
export { validateConfig } from './config/validate-config';

// Health (see `./health/index.ts` for layout)
export {
  HealthCheckStatus,
  HealthCheckDetail,
  HealthCheckResponse,
  AggregatedHealthResult,
  aggregateHealth,
  HealthModule,
  HealthAggregatorService,
  HEALTH_MODULE_OPTIONS,
  assertHealthModuleOptions,
  createHealthController,
  rejectAfter,
  DatabaseHealthCheck,
  RedisHealthCheck,
  HEALTH_REDIS_CLIENT,
} from './health';
export type {
  HealthCheck,
  HealthModuleOptions,
  HealthCheckRegistration,
  RedisPingClient,
} from './health';

// Middleware
export { RequestIdMiddleware } from './middleware/request-id.middleware';
