export type HttpErrorType = 'client' | 'upstream' | 'network' | 'timeout' | 'blocked';

export interface ExternalHttpErrorInit {
  serviceName?: string;
  method: string;
  url: string;
  statusCode?: number;
  isTimeout: boolean;
  isNetworkError: boolean;
  responseBody?: unknown;
  requestId?: string;
  attempt: number;
  maxAttempts: number;
  upstreamCorrelationId?: string;
  cause?: unknown;
  kind?: HttpErrorType;
  message?: string;
}

export class ExternalHttpError extends Error {
  public readonly serviceName?: string;
  public readonly method: string;
  public readonly url: string;
  public readonly statusCode?: number;
  public readonly isTimeout: boolean;
  public readonly isNetworkError: boolean;
  public readonly responseBody?: unknown;
  public readonly requestId?: string;
  public readonly attempt: number;
  public readonly maxAttempts: number;
  public readonly upstreamCorrelationId?: string;
  public readonly kind: HttpErrorType;

  constructor(init: ExternalHttpErrorInit) {
    super(
      init.message ??
        `${init.method.toUpperCase()} ${init.url} failed (attempt ${init.attempt}/${init.maxAttempts})`,
    );
    if (init.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = init.cause;
    }
    this.name = 'ExternalHttpError';
    this.serviceName = init.serviceName;
    this.method = init.method;
    this.url = init.url;
    this.statusCode = init.statusCode;
    this.isTimeout = init.isTimeout;
    this.isNetworkError = init.isNetworkError;
    this.responseBody = init.responseBody;
    this.requestId = init.requestId;
    this.attempt = init.attempt;
    this.maxAttempts = init.maxAttempts;
    this.upstreamCorrelationId = init.upstreamCorrelationId;
    this.kind = init.kind ?? (init.isTimeout ? 'timeout' : init.isNetworkError ? 'network' : 'upstream');
  }
}

// Backward-compatible alias used by existing consumers/tests.
export class HttpClientException extends ExternalHttpError {}
