import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { getRequestId } from '../logging/request-context';
import { ExternalHttpError, HttpClientException } from './http-client.exception';

export interface HttpClientOptions {
  serviceName?: string;
  baseURL?: string;
  timeoutMs?: number;
  retries?: number;
  defaultHeaders?: Record<string, string>;
  allowNonIdempotentRetries?: boolean;
  retryableStatusCodes?: number[];
  retryableMethods?: string[];
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  backoffJitterRatio?: number;
  forwardRequestId?: boolean;
  allowedHosts?: string[];
  circuitBreaker?: CircuitBreakerPolicy;
  logger?: HttpLogHook;
  metrics?: HttpMetricsHook;
  clients?: Record<string, NamedHttpClientProfile>;
}

export interface RequestOptions extends AxiosRequestConfig {
  timeoutMs?: number;
  retries?: number;
  baseURL?: string;
  serviceName?: string;
  idempotencyKey?: string;
  retryNonIdempotent?: boolean;
  allowHostsBypass?: boolean;
  fallback?: <T>(error: ExternalHttpError) => T | Promise<T>;
}

export interface NamedHttpClientProfile {
  baseURL?: string;
  timeoutMs?: number;
  retries?: number;
  defaultHeaders?: Record<string, string>;
  allowNonIdempotentRetries?: boolean;
  retryableStatusCodes?: number[];
  retryableMethods?: string[];
  circuitBreaker?: CircuitBreakerPolicy;
}

export interface CircuitBreakerPolicy {
  enabled?: boolean;
  failureThreshold?: number;
  resetTimeoutMs?: number;
}

export interface HttpLogRecord {
  serviceName: string;
  method: string;
  path: string;
  status?: number;
  durationMs: number;
  attempt: number;
  retryCount: number;
  requestId?: string;
  errorKind?: string;
}

export interface HttpMetricsRecord {
  serviceName: string;
  method: string;
  statusClass: string;
  latencyMs: number;
  retryCount: number;
  success: boolean;
}

export type HttpLogHook = (record: HttpLogRecord) => void;
export type HttpMetricsHook = (record: HttpMetricsRecord) => void;

export interface HttpTransport {
  request<T = unknown>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}

interface CircuitState {
  failures: number;
  openedAtMs?: number;
}

@Injectable()
export class HttpClientService {
  private readonly client: HttpTransport;
  private readonly defaultRetries: number;
  private readonly defaultTimeoutMs: number;
  private readonly options: HttpClientOptions;
  private readonly circuitStates = new Map<string, CircuitState>();

  constructor(options: HttpClientOptions = {}, transport?: HttpTransport) {
    this.options = options;
    this.defaultRetries = options.retries ?? 3;
    this.defaultTimeoutMs = options.timeoutMs ?? 10000;

    const axiosInstance = axios.create({
      baseURL: options.baseURL,
      timeout: this.defaultTimeoutMs,
      headers: options.defaultHeaders,
    });
    this.client = transport ?? axiosInstance;
  }

  forService(serviceName: string): HttpClientService {
    const profile = this.options.clients?.[serviceName];
    if (!profile) {
      throw new Error(`HTTP client profile not found: ${serviceName}`);
    }
    const merged: HttpClientOptions = {
      ...this.options,
      ...profile,
      serviceName,
      defaultHeaders: { ...this.options.defaultHeaders, ...profile.defaultHeaders },
    };
    return new HttpClientService(merged);
  }

  async getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
    return this.get<T>(url, options);
  }

  async postJson<T>(url: string, data: unknown, options: RequestOptions = {}): Promise<T> {
    return this.post<T>(url, data, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  }

  async postForm<T>(
    url: string,
    data: Record<string, string | number | boolean>,
    options: RequestOptions = {},
  ): Promise<T> {
    const body = new URLSearchParams(
      Object.entries(data).map(([k, v]): [string, string] => [k, String(v)]),
    ).toString();
    return this.post<T>(url, body, {
      ...options,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  }

  async getText(url: string, options: RequestOptions = {}): Promise<string> {
    return this.request<string>({
      method: 'GET',
      url,
      responseType: 'text',
      ...options,
    });
  }

  async get<T>(url: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'GET', url, ...options });
  }

  async post<T>(url: string, data: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'POST', url, data, ...options });
  }

  async put<T>(url: string, data: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'PUT', url, data, ...options });
  }

  async patch<T>(url: string, data: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'PATCH', url, data, ...options });
  }

  async delete<T>(url: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'DELETE', url, ...options });
  }

  private async request<T>(config: RequestOptions): Promise<T> {
    const started = Date.now();
    const method = (config.method ?? 'GET').toUpperCase();
    const serviceName = config.serviceName ?? this.options.serviceName ?? 'default';
    const requestId = getRequestId();
    const profile = this.options.clients?.[serviceName];
    const retryableMethods = (profile?.retryableMethods ?? this.options.retryableMethods ?? [
      'GET',
      'HEAD',
      'PUT',
      'DELETE',
      'OPTIONS',
    ]).map(v => v.toUpperCase());
    const allowNonIdempotent =
      config.retryNonIdempotent ??
      profile?.allowNonIdempotentRetries ??
      this.options.allowNonIdempotentRetries ??
      false;
    const canRetryMethod = retryableMethods.includes(method) || allowNonIdempotent;
    const retryableStatusCodes =
      profile?.retryableStatusCodes ??
      this.options.retryableStatusCodes ??
      [408, 429, 500, 502, 503, 504];
    const circuitPolicy = profile?.circuitBreaker ?? this.options.circuitBreaker;

    if (!config.allowHostsBypass) {
      this.enforceAllowedHost(config.url ?? '', config.baseURL ?? profile?.baseURL ?? this.options.baseURL);
    }
    this.enforceCircuit(serviceName, circuitPolicy);

    const maxAttempts = (config.retries ?? this.defaultRetries) + 1;
    const timeout = config.timeoutMs ?? this.defaultTimeoutMs;
    const url = config.url ?? '';
    let lastError: HttpClientException | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const mergedHeaders: Record<string, unknown> = {
          ...(this.options.defaultHeaders ?? {}),
          ...(profile?.defaultHeaders ?? {}),
          ...((config.headers as Record<string, unknown> | undefined) ?? {}),
        };
        if (this.options.forwardRequestId !== false && requestId && !mergedHeaders['x-request-id']) {
          mergedHeaders['x-request-id'] = requestId;
        }
        if (config.idempotencyKey && !mergedHeaders['idempotency-key']) {
          mergedHeaders['idempotency-key'] = config.idempotencyKey;
        }

        const response: AxiosResponse<T> = await this.client.request({
          ...config,
          baseURL: config.baseURL ?? profile?.baseURL ?? this.options.baseURL,
          headers: mergedHeaders as AxiosRequestConfig['headers'],
          timeout,
        });
        this.markSuccess(serviceName);
        this.emitTelemetry({
          serviceName,
          method,
          path: this.getPath(url),
          status: response.status,
          durationMs: Date.now() - started,
          attempt,
          retryCount: attempt - 1,
          requestId,
        });
        return response.data;
      } catch (err: unknown) {
        const mapped = this.toHttpClientException(err, {
          serviceName,
          method,
          url,
          requestId,
          attempt,
          maxAttempts,
        });
        lastError = mapped;

        const status = mapped.statusCode;
        const retryableStatus = status !== undefined && retryableStatusCodes.includes(status);
        const retryable =
          canRetryMethod &&
          attempt < maxAttempts &&
          (mapped.isNetworkError || mapped.isTimeout || retryableStatus);

        if (retryable) {
          await this.backoff(attempt);
          continue;
        }

        this.markFailure(serviceName, circuitPolicy);
        this.emitTelemetry({
          serviceName,
          method,
          path: this.getPath(url),
          status,
          durationMs: Date.now() - started,
          attempt,
          retryCount: attempt - 1,
          requestId,
          errorKind: mapped.kind,
        });
        if (config.fallback) {
          return await config.fallback<T>(mapped);
        }
        throw mapped;
      }
    }

    throw lastError ?? new HttpClientException({
      serviceName,
      method,
      url,
      isTimeout: false,
      isNetworkError: false,
      requestId,
      attempt: maxAttempts,
      maxAttempts,
      kind: 'upstream',
      message: 'Request failed after retries',
    });
  }

  private backoff(attempt: number): Promise<void> {
    const base = this.options.backoffBaseMs ?? 100;
    const max = this.options.backoffMaxMs ?? 5000;
    const jitterRatio = this.options.backoffJitterRatio ?? 0.2;
    const raw = Math.min(base * Math.pow(2, attempt - 1), max);
    const jitter = raw * jitterRatio * Math.random();
    const ms = Math.floor(raw + jitter);
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private toHttpClientException(
    err: unknown,
    meta: {
      serviceName: string;
      method: string;
      url: string;
      requestId?: string;
      attempt: number;
      maxAttempts: number;
    },
  ): HttpClientException {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const isTimeout = err.code === 'ECONNABORTED';
      const isNetworkError = !err.response;
      const headers = (err.response?.headers ?? {}) as Record<string, string | undefined>;
      const upstreamCorrelationId =
        headers['x-request-id'] ?? headers['x-correlation-id'] ?? headers['x-amzn-requestid'];
      return new HttpClientException({
        ...meta,
        statusCode: status,
        isTimeout,
        isNetworkError,
        responseBody: this.safeBody(err.response?.data),
        upstreamCorrelationId,
        cause: err,
        kind: isTimeout
          ? 'timeout'
          : isNetworkError
            ? 'network'
            : status !== undefined && status >= 400 && status < 500
              ? 'client'
              : 'upstream',
      });
    }
    return new HttpClientException({
      ...meta,
      isTimeout: false,
      isNetworkError: false,
      cause: err,
      kind: 'upstream',
    });
  }

  private safeBody(data: unknown): unknown {
    if (data === undefined || data === null) {
      return data;
    }
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    if (text.length <= 1000) {
      return data;
    }
    return `${text.slice(0, 1000)}...<truncated>`;
  }

  private getPath(url: string): string {
    try {
      return new URL(url, 'http://placeholder.local').pathname;
    } catch {
      return url;
    }
  }

  private enforceAllowedHost(url: string, baseURL?: string): void {
    if (!this.options.allowedHosts || this.options.allowedHosts.length === 0) {
      return;
    }
    const absolute = this.resolveAbsoluteUrl(url, baseURL);
    if (!absolute) {
      return;
    }
    if (!this.options.allowedHosts.includes(absolute.hostname)) {
      throw new HttpClientException({
        serviceName: this.options.serviceName,
        method: 'UNKNOWN',
        url: absolute.toString(),
        isTimeout: false,
        isNetworkError: false,
        attempt: 1,
        maxAttempts: 1,
        kind: 'blocked',
        message: `Blocked outbound host: ${absolute.hostname}`,
      });
    }
  }

  private resolveAbsoluteUrl(url: string, baseURL?: string): URL | undefined {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return new URL(url);
      }
      if (baseURL) {
        return new URL(url, baseURL);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private emitTelemetry(record: HttpLogRecord): void {
    this.options.logger?.(record);
    this.options.metrics?.({
      serviceName: record.serviceName,
      method: record.method,
      statusClass: record.status ? `${Math.floor(record.status / 100)}xx` : 'error',
      latencyMs: record.durationMs,
      retryCount: record.retryCount,
      success: record.status !== undefined && record.status < 500,
    });
  }

  private enforceCircuit(serviceName: string, policy?: CircuitBreakerPolicy): void {
    if (!policy?.enabled) {
      return;
    }
    const state = this.circuitStates.get(serviceName);
    if (!state?.openedAtMs) {
      return;
    }
    const resetMs = policy.resetTimeoutMs ?? 30_000;
    if (Date.now() - state.openedAtMs >= resetMs) {
      this.circuitStates.delete(serviceName);
      return;
    }
    throw new HttpClientException({
      serviceName,
      method: 'UNKNOWN',
      url: serviceName,
      isTimeout: false,
      isNetworkError: false,
      attempt: 1,
      maxAttempts: 1,
      kind: 'blocked',
      message: `Circuit breaker open for ${serviceName}`,
    });
  }

  private markFailure(serviceName: string, policy?: CircuitBreakerPolicy): void {
    if (!policy?.enabled) {
      return;
    }
    const threshold = policy.failureThreshold ?? 5;
    const state = this.circuitStates.get(serviceName) ?? { failures: 0 };
    state.failures += 1;
    if (state.failures >= threshold) {
      state.openedAtMs = Date.now();
    }
    this.circuitStates.set(serviceName, state);
  }

  private markSuccess(serviceName: string): void {
    this.circuitStates.delete(serviceName);
  }
}

export function createHttpClient(name: string, config: HttpClientOptions): HttpClientService {
  return new HttpClientService({ ...config, serviceName: name });
}
