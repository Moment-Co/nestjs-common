# HTTP client module

Shared outbound HTTP client for Nest and non-Nest runtimes.

## API surface

| Symbol | Role |
|--------|------|
| `HttpClientModule` | Nest wrapper (`forRoot` / `forRootAsync`) |
| `HttpClientService` | Core typed client (`get/post/put/patch/delete`) |
| `createHttpClient(name, config)` | Named client factory for non-Nest use |
| `HttpClientOptions` | Global/client defaults (timeouts/retries/headers/policies) |
| `RequestOptions` | Per-request overrides (`headers`, `params`, `timeoutMs`, `baseURL`, `signal`, `fallback`) |
| `ExternalHttpError` / `HttpClientException` | Standard normalized error model |

## Functional capabilities

- Typed methods: `get/post/put/patch/delete<T>()`
- Helpers: `getJson`, `postJson`, `postForm`, `getText`
- Payload modes:
  - JSON
  - `application/x-www-form-urlencoded` (`postForm`)
  - raw text response (`getText`)
- Base URL support at:
  - module/client level (`HttpClientOptions.baseURL`)
  - per request (`RequestOptions.baseURL`)
- Header merge priority:
  - global defaults
  - named client defaults
  - per-request headers (highest)
- Correlation propagation:
  - forwards `x-request-id` from request context if available
- Cancellation:
  - pass `signal` in `RequestOptions`

## Reliability behavior

- `maxAttempts = retries + 1`
- Retry only on retryable methods by default (idempotent methods)
- Default retryable status codes: `408, 429, 500, 502, 503, 504`
- Retries on network and timeout errors
- Backoff: exponential with jitter (`backoffBaseMs`, `backoffMaxMs`, `backoffJitterRatio`)
- Circuit breaker (optional): `circuitBreaker.enabled`, `failureThreshold`, `resetTimeoutMs`
- Best-effort fallback hook per request: `fallback(error)`

## Security and controls

- Optional outbound host allowlist: `allowedHosts`
- Large error bodies are truncated before attaching to normalized error (`responseBody`)

## Error model

`HttpClientException` (`ExternalHttpError`) includes:

- `serviceName`, `method`, `url`, `statusCode`
- `kind` (`client` | `upstream` | `network` | `timeout` | `blocked`)
- `attempt`, `maxAttempts`
- `requestId`, `upstreamCorrelationId`
- `responseBody` (safe/truncated)

## Named client profile usage

```typescript
import { HttpClientService } from '@momentco/nestjs-common';

const root = new HttpClientService({
  clients: {
    publisher: {
      baseURL: 'https://publisher.internal',
      timeoutMs: 4000,
      retries: 2,
      defaultHeaders: { 'x-api-key': process.env.PUBLISHER_API_KEY! },
    },
  },
});

const publisher = root.forService('publisher');
const data = await publisher.postJson('/events', { id: 'evt-1' });
```

## Nest usage

```typescript
import { Module } from '@nestjs/common';
import { HttpClientModule } from '@momentco/nestjs-common';

@Module({
  imports: [
    HttpClientModule.forRoot({
      timeoutMs: 5000,
      retries: 2,
      forwardRequestId: true,
    }),
  ],
})
export class AppModule {}
```

## Importer service scenarios

### Scenario A: provider token exchange (form-encoded)

```typescript
const token = await http.postForm<{ access_token: string }>(
  '/oauth/token',
  {
    grant_type: 'client_credentials',
    client_id: env.IMPORTER_CLIENT_ID,
    client_secret: env.IMPORTER_CLIENT_SECRET,
  },
  { serviceName: 'providerAuth', timeoutMs: 8000, retries: 1 },
);
```

### Scenario B: fire-and-forget sync callbacks (best-effort)

```typescript
await http.postJson(
  '/sync/callback',
  payload,
  {
    serviceName: 'consumerApi',
    fallback: () => ({ ok: false }),
  },
);
```

### Scenario C: importer high-throughput fetch with named profiles

```typescript
const providerClient = http.forService('providerApi');
const records = await providerClient.getJson<{ items: unknown[] }>('/imports', {
  params: { page: 1, limit: 100 },
});
```

### Scenario D: map outbound failures to importer exceptions

- retryable upstream failures -> throw `UpstreamServiceException`
- client/data contract failures -> throw `ValidationException`
- preserve `requestId` in logs for traceability
