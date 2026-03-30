# Exceptions module

Use shared exception classes and filter to keep importer-service API errors uniform.

## API surface

| Symbol | Role |
|--------|------|
| `MomentException` | Base typed exception (`code`, `statusCode`, `message`) |
| `NotFoundException` | `404` with `NOT_FOUND` |
| `UnauthorizedException` | `401` with `UNAUTHORIZED` |
| `ValidationException` | `400` with `VALIDATION_ERROR` |
| `UpstreamServiceException` | `502` with `UPSTREAM_SERVICE_ERROR` |
| `MomentExceptionFilter` | Serializes errors to standard response body |
| `MomentErrorCode` | Shared error code enum |

## Standard response shape

`MomentExceptionFilter` returns:

- `code`
- `message`
- `statusCode`
- `requestId` (from request context)
- `timestamp`

## Importer service usage patterns

### 1) Input validation failure

Use `ValidationException` when importer request payload/config is invalid.

```typescript
if (!payload.sourceUrl) {
  throw new ValidationException('sourceUrl is required');
}
```

### 2) Upstream provider failure (retry exhausted)

Map downstream HTTP/client failures to `UpstreamServiceException` so importer API remains stable.

```typescript
try {
  await this.providerClient.fetch();
} catch {
  throw new UpstreamServiceException('Importer provider unavailable');
}
```

### 3) Resource lookup failures

Use `NotFoundException` for importer records/jobs that do not exist.

```typescript
if (!job) {
  throw new NotFoundException('Import job not found');
}
```

### 4) Auth failures (webhooks/admin endpoints)

Use `UnauthorizedException` for invalid tokens/signatures.

```typescript
if (!isValidSignature) {
  throw new UnauthorizedException('Invalid signature');
}
```

## Register filter globally (Nest)

```typescript
import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { MomentExceptionFilter } from '@momentco/nestjs-common';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: MomentExceptionFilter,
    },
  ],
})
export class AppModule {}
```

## Recommended importer error-mapping matrix

- Validation/parsing error -> `ValidationException`
- Upstream timeout/5xx/retry exhausted -> `UpstreamServiceException`
- Missing import config/job/resource -> `NotFoundException`
- Auth/signature failure -> `UnauthorizedException`
- Unexpected internal bug -> generic error (filter emits `INTERNAL_ERROR`)
