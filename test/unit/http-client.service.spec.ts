import axios from 'axios';
import { HttpClientService } from '../../src/http-client/http-client.service';
import { HttpClientException } from '../../src/http-client/http-client.exception';
import * as requestContext from '../../src/logging/request-context';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HttpClientService', () => {
  let service: HttpClientService;

  beforeEach(() => {
    mockedAxios.create.mockReturnValue(mockedAxios as never);
    mockedAxios.request.mockReset();
    mockedAxios.isAxiosError.mockReturnValue(true);
    jest.spyOn(requestContext, 'getRequestId').mockReturnValue(undefined);
    service = new HttpClientService({ retries: 1, timeoutMs: 1000 });
  });

  it('throws HttpClientException with type=client on 404', async () => {
    mockedAxios.request.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404 },
    });

    await expect(service.get('/test')).rejects.toThrow(HttpClientException);
  });

  it('does not retry POST by default', async () => {
    mockedAxios.request.mockRejectedValue({
      isAxiosError: true,
      response: { status: 503 },
    });

    await expect(service.post('/test', { ok: true })).rejects.toThrow(HttpClientException);
    expect(mockedAxios.request).toHaveBeenCalledTimes(1);
  });

  it('forwards x-request-id when available', async () => {
    jest.spyOn(requestContext, 'getRequestId').mockReturnValue('rid-123');
    mockedAxios.request.mockResolvedValueOnce({ status: 200, data: { ok: true } } as never);

    await service.get('/test');

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-request-id': 'rid-123' }),
      }),
    );
  });

  it('postForm sends x-www-form-urlencoded body', async () => {
    mockedAxios.request.mockResolvedValueOnce({ status: 200, data: { ok: true } } as never);

    await service.postForm('/token', {
      client_id: 'abc',
      grant_type: 'client_credentials',
    });

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/x-www-form-urlencoded',
        }),
        data: 'client_id=abc&grant_type=client_credentials',
      }),
    );
  });

  it('creates named client via forService profile', async () => {
    const root = new HttpClientService({
      clients: {
        analytics: {
          baseURL: 'https://analytics.example.com',
          timeoutMs: 2500,
          defaultHeaders: { 'x-api-key': 'k' },
        },
      },
    });
    const client = root.forService('analytics');
    mockedAxios.request.mockResolvedValueOnce({ status: 200, data: { ok: true } } as never);

    await client.get('/ingest');

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://analytics.example.com',
        headers: expect.objectContaining({ 'x-api-key': 'k' }),
      }),
    );
  });

  it('retries GET on retryable 5xx status', async () => {
    mockedAxios.request
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 503 },
      })
      .mockResolvedValueOnce({ status: 200, data: { ok: true } } as never);

    const result = await service.get<{ ok: boolean }>('/retry-me');
    expect(result.ok).toBe(true);
    expect(mockedAxios.request).toHaveBeenCalledTimes(2);
  });

  it('retries POST only when retryNonIdempotent is true', async () => {
    mockedAxios.request
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 503 },
      })
      .mockResolvedValueOnce({ status: 200, data: { ok: true } } as never);

    const result = await service.post<{ ok: boolean }>('/submit', { payload: 1 }, { retryNonIdempotent: true });
    expect(result.ok).toBe(true);
    expect(mockedAxios.request).toHaveBeenCalledTimes(2);
  });

  it('uses fallback hook for best-effort calls', async () => {
    mockedAxios.request.mockRejectedValue({
      isAxiosError: true,
      response: { status: 503, data: { message: 'down' } },
    });

    const value = await service.get<{ ok: boolean }>('/best-effort', {
      fallback: (() => ({ ok: false })) as never,
    });

    expect(value).toEqual({ ok: false });
  });

  it('blocks disallowed outbound hosts via allowlist', async () => {
    const secureClient = new HttpClientService({
      allowedHosts: ['allowed.example.com'],
    });

    await expect(secureClient.get('https://blocked.example.com/health')).rejects.toMatchObject({
      kind: 'blocked',
    });
    expect(mockedAxios.request).not.toHaveBeenCalled();
  });

  it('opens circuit breaker after threshold failures', async () => {
    const cbClient = new HttpClientService({
      serviceName: 'publisher',
      retries: 0,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 1,
        resetTimeoutMs: 60_000,
      },
    });

    mockedAxios.request.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503 },
    });

    await expect(cbClient.get('/first')).rejects.toBeInstanceOf(HttpClientException);
    const callsAfterFirst = mockedAxios.request.mock.calls.length;

    await expect(cbClient.get('/second')).rejects.toMatchObject({ kind: 'blocked' });
    expect(mockedAxios.request.mock.calls.length).toBe(callsAfterFirst);
  });

  it('maps timeout/network metadata in normalized errors', async () => {
    const noRetry = new HttpClientService({ retries: 0, timeoutMs: 1000 });
    mockedAxios.request.mockRejectedValueOnce({
      isAxiosError: true,
      code: 'ECONNABORTED',
      response: undefined,
    });

    await expect(noRetry.get('/timeout')).rejects.toMatchObject({
      isTimeout: true,
      isNetworkError: true,
      kind: 'timeout',
      attempt: 1,
      maxAttempts: 1,
    });
  });

  it('captures upstream correlation id and truncates large response body', async () => {
    const noRetry = new HttpClientService({ retries: 0, timeoutMs: 1000 });
    mockedAxios.request.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 502,
        headers: { 'x-correlation-id': 'up-req-1' },
        data: 'x'.repeat(2000),
      },
    });

    await expect(noRetry.get('/big-error')).rejects.toMatchObject({
      upstreamCorrelationId: 'up-req-1',
      kind: 'upstream',
      responseBody: expect.stringContaining('<truncated>'),
    });
  });
});
