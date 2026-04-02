import { aggregateHealth, HealthCheckDetail } from '../../src';

describe('aggregateHealth', () => {
  const service = 'test-service';
  const version = '1.0.0';

  const ok = (ms: number): HealthCheckDetail => ({ status: 'ok', responseTimeMs: ms });
  const fail = (err: string): HealthCheckDetail => ({ status: 'fail', responseTimeMs: null, error: err });

  it('returns ok / 200 when all checks pass', () => {
    const result = aggregateHealth(
      { database: ok(4), redis: ok(1) },
      ['database'],
      service,
      version,
    );
    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('ok');
    expect(result.body.service).toBe(service);
    expect(result.body.version).toBe(version);
  });

  it('returns degraded / 200 when only non-critical checks fail', () => {
    const result = aggregateHealth(
      { database: ok(4), redis: fail('Connection refused') },
      ['database'],
      service,
      version,
    );
    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('degraded');
  });

  it('returns fail / 503 when a critical check fails', () => {
    const result = aggregateHealth(
      { database: fail('Connection timeout'), redis: ok(1) },
      ['database'],
      service,
      version,
    );
    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('fail');
  });

  it('returns fail / 503 when both critical and non-critical fail', () => {
    const result = aggregateHealth(
      { database: fail('timeout'), redis: fail('refused'), pubsub: ok(2) },
      ['database'],
      service,
      version,
    );
    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('fail');
  });

  it('includes all checks in the body', () => {
    const checks = { database: ok(3), redis: ok(1), pubsub: ok(5) };
    const result = aggregateHealth(checks, ['database'], service, version);
    expect(result.body.checks).toEqual(checks);
  });

  it('includes an ISO timestamp', () => {
    const result = aggregateHealth({ database: ok(1) }, ['database'], service, version);
    expect(new Date(result.body.timestamp).toISOString()).toBe(result.body.timestamp);
  });
});
