import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthModule,
  HealthAggregatorService,
  type HealthCheck,
  type HealthCheckDetail,
} from '../../src';

@Injectable()
class AlphaCheck implements HealthCheck {
  async check(): Promise<HealthCheckDetail> {
    return { status: 'ok', responseTimeMs: 1 };
  }
}

@Injectable()
class BetaCheck implements HealthCheck {
  async check(): Promise<HealthCheckDetail> {
    return { status: 'ok', responseTimeMs: 2 };
  }
}

@Injectable()
class AlphaFailCheck implements HealthCheck {
  async check(): Promise<HealthCheckDetail> {
    return { status: 'fail', responseTimeMs: null, error: 'Connection timeout' };
  }
}

@Injectable()
class BetaFailCheck implements HealthCheck {
  async check(): Promise<HealthCheckDetail> {
    return {
      status: 'fail',
      responseTimeMs: null,
      error: 'Connection refused',
    };
  }
}

/** Docs: unit-test pattern — mock probe */
@Injectable()
class MockableCheck implements HealthCheck {
  check = jest.fn(async (): Promise<HealthCheckDetail> => ({
    status: 'ok',
    responseTimeMs: 0,
  }));
}

describe('HealthModule (docs: health-module.md)', () => {
  const prevServiceName = process.env.SERVICE_NAME;
  const prevServiceVersion = process.env.SERVICE_VERSION;
  const prevNpmVersion = process.env.npm_package_version;

  afterEach(() => {
    if (prevServiceName === undefined) delete process.env.SERVICE_NAME;
    else process.env.SERVICE_NAME = prevServiceName;
    if (prevServiceVersion === undefined) delete process.env.SERVICE_VERSION;
    else process.env.SERVICE_VERSION = prevServiceVersion;
    if (prevNpmVersion === undefined) delete process.env.npm_package_version;
    else process.env.npm_package_version = prevNpmVersion;
  });

  it('forRoot registers checks and exposes GET /health', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          checks: [
            { key: 'alpha', useClass: AlphaCheck },
            { key: 'beta', useClass: BetaCheck },
          ],
          criticalKeys: ['alpha'],
          path: 'health',
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      checks: Record<string, HealthCheckDetail>;
    };
    expect(body.status).toBe('ok');
    expect(body.checks.alpha).toEqual({ status: 'ok', responseTimeMs: 1 });
    expect(body.checks.beta).toEqual({ status: 'ok', responseTimeMs: 2 });

    await app.close();
  });

  it('uses custom path option (docs: path segment without leading slash)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          checks: [{ key: 'alpha', useClass: AlphaCheck }],
          criticalKeys: ['alpha'],
          path: 'status',
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${address.port}/status`);
    expect(res.status).toBe(200);
    await app.close();
  });

  it('returns 503 + fail when a critical check fails (docs: aggregation rules)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          checks: [
            { key: 'alpha', useClass: AlphaFailCheck },
            { key: 'beta', useClass: BetaCheck },
          ],
          criticalKeys: ['alpha'],
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('fail');
    await app.close();
  });

  it('returns 200 + degraded when only non-critical checks fail', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          checks: [
            { key: 'alpha', useClass: AlphaCheck },
            { key: 'beta', useClass: BetaFailCheck },
          ],
          criticalKeys: ['alpha'],
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('degraded');
    await app.close();
  });

  it('uses SERVICE_NAME and SERVICE_VERSION in JSON (docs: service identity)', async () => {
    process.env.SERVICE_NAME = 'my-service';
    process.env.SERVICE_VERSION = '1.0.0';
    delete process.env.npm_package_version;

    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          checks: [{ key: 'alpha', useClass: AlphaCheck }],
          criticalKeys: ['alpha'],
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    const body = (await (
      await fetch(`http://127.0.0.1:${address.port}/health`)
    ).json()) as { service: string; version: string };

    expect(body.service).toBe('my-service');
    expect(body.version).toBe('1.0.0');
    await app.close();
  });

  it('forRootAsync supplies criticalKeys from useFactory (docs: forRootAsync)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRootAsync({
          checks: [
            { key: 'alpha', useClass: AlphaCheck },
            { key: 'beta', useClass: BetaCheck },
          ],
          path: 'health',
          useFactory: async () => ({ criticalKeys: ['alpha'] }),
          inject: [],
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(res.status).toBe(200);
    await app.close();
  });

  it('HealthAggregatorService.runAllChecks matches registered keys', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          checks: [
            { key: 'alpha', useClass: AlphaCheck },
            { key: 'beta', useClass: BetaCheck },
          ],
          criticalKeys: ['alpha'],
        }),
      ],
    }).compile();

    const agg = moduleRef.get(HealthAggregatorService);
    const checks = await agg.runAllChecks();
    expect(checks.alpha).toEqual({ status: 'ok', responseTimeMs: 1 });
    expect(checks.beta).toEqual({ status: 'ok', responseTimeMs: 2 });
  });

  it('docs: mock HealthCheck with useValue for unit tests', async () => {
    const mock = new MockableCheck();
    mock.check.mockResolvedValue({ status: 'ok', responseTimeMs: 42 });

    const moduleRef = await Test.createTestingModule({
      imports: [
        HealthModule.forRoot({
          checks: [{ key: 'alpha', useClass: MockableCheck }],
          criticalKeys: ['alpha'],
        }),
      ],
    })
      .overrideProvider(MockableCheck)
      .useValue(mock)
      .compile();

    const agg = moduleRef.get(HealthAggregatorService);
    await expect(agg.runAllChecks()).resolves.toEqual({
      alpha: { status: 'ok', responseTimeMs: 42 },
    });
    expect(mock.check).toHaveBeenCalled();
  });

  it('throws when criticalKeys references an unknown check key', () => {
    expect(() =>
      HealthModule.forRoot({
        checks: [{ key: 'alpha', useClass: AlphaCheck }],
        criticalKeys: ['missing'],
      }),
    ).toThrow(/criticalKeys contains "missing"/);
  });
});
