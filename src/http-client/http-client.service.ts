import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpClientException } from './http-client.exception';

export interface HttpClientOptions {
  baseURL?: string;
  timeoutMs?: number;
  retries?: number;
}

export interface RequestOptions extends AxiosRequestConfig {
  timeoutMs?: number;
  retries?: number;
}

@Injectable()
export class HttpClientService {
  private readonly client: AxiosInstance;
  private readonly defaultRetries: number;
  private readonly defaultTimeoutMs: number;

  constructor(options: HttpClientOptions = {}) {
    this.defaultRetries = options.retries ?? 3;
    this.defaultTimeoutMs = options.timeoutMs ?? 10000;

    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: this.defaultTimeoutMs,
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

  async delete<T>(url: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>({ method: 'DELETE', url, ...options });
  }

  private async request<T>(config: RequestOptions): Promise<T> {
    const maxAttempts = (config.retries ?? this.defaultRetries) + 1;
    const timeout = config.timeoutMs ?? this.defaultTimeoutMs;
    const url = config.url ?? '';

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response: AxiosResponse<T> = await this.client.request({
          ...config,
          timeout,
        });
        return response.data;
      } catch (err: unknown) {
        lastError = err;

        if (axios.isAxiosError(err)) {
          const status = err.response?.status;

          // 4xx — client error, do not retry
          if (status !== undefined && status >= 400 && status < 500) {
            throw new HttpClientException('client', url, attempt, status);
          }

          // 5xx — upstream error, retry with backoff
          if (status !== undefined && status >= 500) {
            if (attempt === maxAttempts) {
              throw new HttpClientException('upstream', url, attempt, status);
            }
            await this.backoff(attempt);
            continue;
          }

          // Network error — retry
          if (!err.response) {
            if (attempt === maxAttempts) {
              throw new HttpClientException('network', url, attempt);
            }
            await this.backoff(attempt);
            continue;
          }
        }

        throw err;
      }
    }

    throw lastError;
  }

  private backoff(attempt: number): Promise<void> {
    const ms = Math.min(100 * Math.pow(2, attempt - 1), 5000);
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
