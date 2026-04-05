import { createGcpLoggingTransport } from '../../src/logging/gcp-logging.transport';

const MockLoggingWinston = jest.fn().mockImplementation(() => ({ name: 'gcp' }));
jest.mock('@google-cloud/logging-winston', () => ({
  LoggingWinston: MockLoggingWinston,
}));

describe('createGcpLoggingTransport', () => {
  const prevKService = process.env.K_SERVICE;

  afterEach(() => {
    if (prevKService === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = prevKService;
    jest.clearAllMocks();
  });

  it('returns undefined when disabled (default local)', () => {
    delete process.env.K_SERVICE;

    const transport = createGcpLoggingTransport();

    expect(transport).toBeUndefined();
    expect(MockLoggingWinston).not.toHaveBeenCalled();
  });

  it('returns a transport when enabled explicitly', () => {
    delete process.env.K_SERVICE;

    const transport = createGcpLoggingTransport({ enabled: true });

    expect(transport).toBeDefined();
    expect(MockLoggingWinston).toHaveBeenCalledTimes(1);
  });

  it('returns a transport when K_SERVICE is set', () => {
    process.env.K_SERVICE = 'svc';

    const transport = createGcpLoggingTransport();

    expect(transport).toBeDefined();
  });

  it('passes gcpProjectId to LoggingWinston', () => {
    const transport = createGcpLoggingTransport({
      enabled: true,
      gcpProjectId: 'my-project',
    });

    expect(transport).toBeDefined();
    expect(MockLoggingWinston).toHaveBeenCalledWith({ projectId: 'my-project' });
  });
});
