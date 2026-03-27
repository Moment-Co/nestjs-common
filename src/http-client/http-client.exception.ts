export type HttpErrorType = 'client' | 'upstream' | 'network';

export class HttpClientException extends Error {
  constructor(
    public readonly type: HttpErrorType,
    public readonly url: string,
    public readonly attempt: number,
    public readonly upstreamStatus?: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${type} error on ${url} after ${attempt} attempt(s)`);
    this.name = 'HttpClientException';
  }
}
