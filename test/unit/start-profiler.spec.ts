import { startProfiler } from '../../src/telemetry/start-profiler';

const mockStart = jest.fn().mockResolvedValue(undefined);
jest.mock('@google-cloud/profiler', () => ({
  start: mockStart,
}));

describe('startProfiler', () => {
  const prevKService = process.env.K_SERVICE;

  afterEach(() => {
    if (prevKService === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = prevKService;
    jest.clearAllMocks();
  });

  it('is a no-op when enabled is false (default local)', async () => {
    delete process.env.K_SERVICE;

    await startProfiler({ serviceName: 'test' });

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('calls profiler.start when enabled is explicitly true', async () => {
    delete process.env.K_SERVICE;

    await startProfiler({ serviceName: 'test-svc', enabled: true });

    expect(mockStart).toHaveBeenCalledWith({
      serviceContext: {
        service: 'test-svc',
        version: '0.0.0',
      },
    });
  });

  it('calls profiler.start when K_SERVICE is set', async () => {
    process.env.K_SERVICE = 'cloud-run-svc';

    await startProfiler({ serviceName: 'test-svc', serviceVersion: '2.0.0' });

    expect(mockStart).toHaveBeenCalledWith({
      serviceContext: {
        service: 'test-svc',
        version: '2.0.0',
      },
    });
  });

  it('does not throw when profiler.start rejects', async () => {
    mockStart.mockRejectedValueOnce(new Error('auth error'));

    await expect(
      startProfiler({ serviceName: 'test', enabled: true }),
    ).resolves.toBeUndefined();
  });
});
