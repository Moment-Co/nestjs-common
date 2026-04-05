import { initTracing } from '../../src/telemetry/init-tracing';

jest.mock('@opentelemetry/sdk-node', () => {
  const start = jest.fn();
  const shutdown = jest.fn().mockResolvedValue(undefined);
  return {
    NodeSDK: jest.fn().mockImplementation(() => ({ start, shutdown })),
  };
});
jest.mock('@opentelemetry/resources', () => ({
  Resource: jest.fn().mockImplementation((attrs: unknown) => ({ attrs })),
}));
jest.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
}));
jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn().mockReturnValue([]),
}));
jest.mock('@google-cloud/opentelemetry-cloud-trace-exporter', () => ({
  TraceExporter: jest.fn().mockImplementation(() => ({ type: 'gcp-trace' })),
}));
jest.mock('@google-cloud/opentelemetry-cloud-monitoring-exporter', () => ({
  MetricExporter: jest.fn().mockImplementation(() => ({ type: 'gcp-metric' })),
}));
jest.mock('@opentelemetry/sdk-metrics', () => ({
  PeriodicExportingMetricReader: jest.fn().mockImplementation(() => ({ type: 'metric-reader' })),
}));

describe('initTracing', () => {
  const prevKService = process.env.K_SERVICE;

  afterEach(() => {
    if (prevKService === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = prevKService;
    jest.clearAllMocks();
  });

  it('is a no-op when enabled is false (default local)', () => {
    delete process.env.K_SERVICE;
    const { NodeSDK } = require('@opentelemetry/sdk-node');

    initTracing({ serviceName: 'test-svc' });

    expect(NodeSDK).not.toHaveBeenCalled();
  });

  it('starts the SDK when enabled is explicitly true', () => {
    delete process.env.K_SERVICE;
    const { NodeSDK } = require('@opentelemetry/sdk-node');

    initTracing({ serviceName: 'test-svc', enabled: true });

    expect(NodeSDK).toHaveBeenCalledTimes(1);
    const instance = NodeSDK.mock.results[0].value;
    expect(instance.start).toHaveBeenCalled();
  });

  it('starts the SDK when K_SERVICE is present', () => {
    process.env.K_SERVICE = 'my-cloud-run-svc';
    const { NodeSDK } = require('@opentelemetry/sdk-node');

    initTracing({ serviceName: 'test-svc' });

    expect(NodeSDK).toHaveBeenCalledTimes(1);
  });

  it('passes serviceName and serviceVersion as resource attributes', () => {
    const { Resource } = require('@opentelemetry/resources');

    initTracing({ serviceName: 'api', serviceVersion: '1.2.3', enabled: true });

    expect(Resource).toHaveBeenCalledWith(
      expect.objectContaining({
        'service.name': 'api',
        'service.version': '1.2.3',
      }),
    );
  });

  it('passes ignoreIncomingPaths to auto-instrumentations', () => {
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    const paths = [/\/health/];

    initTracing({ serviceName: 'api', enabled: true, ignoreIncomingPaths: paths });

    expect(getNodeAutoInstrumentations).toHaveBeenCalledWith(
      expect.objectContaining({
        '@opentelemetry/instrumentation-http': { ignoreIncomingPaths: paths },
      }),
    );
  });
});
