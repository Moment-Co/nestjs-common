import { GcpErrorReporter } from '../../src/telemetry/gcp-error-reporter';
import { TELEMETRY_OPTIONS } from '../../src/telemetry/telemetry.constants';

const mockReport = jest.fn();
jest.mock('@google-cloud/error-reporting', () => ({
  ErrorReporting: jest.fn().mockImplementation(() => ({
    report: mockReport,
  })),
}));

describe('GcpErrorReporter', () => {
  const prevKService = process.env.K_SERVICE;

  afterEach(() => {
    if (prevKService === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = prevKService;
    jest.clearAllMocks();
  });

  it('does not create a client when disabled', () => {
    delete process.env.K_SERVICE;
    const reporter = new GcpErrorReporter({ serviceName: 'test', enabled: false });

    reporter.report(new Error('test'));

    expect(mockReport).not.toHaveBeenCalled();
  });

  it('creates a client and reports errors when enabled', () => {
    const reporter = new GcpErrorReporter({ serviceName: 'test', enabled: true });
    const err = new Error('real error');

    reporter.report(err);

    expect(mockReport).toHaveBeenCalledWith(err);
  });

  it('wraps non-Error values in an Error before reporting', () => {
    const reporter = new GcpErrorReporter({ serviceName: 'test', enabled: true });

    reporter.report('string error');

    expect(mockReport).toHaveBeenCalledWith(expect.any(Error));
    expect(mockReport.mock.calls[0][0].message).toBe('string error');
  });

  it('creates client when K_SERVICE is set and enabled is not specified', () => {
    process.env.K_SERVICE = 'my-svc';
    const { ErrorReporting } = require('@google-cloud/error-reporting');

    new GcpErrorReporter({ serviceName: 'test' });

    expect(ErrorReporting).toHaveBeenCalledWith(
      expect.objectContaining({
        reportMode: 'always',
        serviceContext: { service: 'test' },
      }),
    );
  });
});
