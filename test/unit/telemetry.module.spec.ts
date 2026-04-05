import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryModule } from '../../src/telemetry/telemetry.module';
import { GcpErrorReporter } from '../../src/telemetry/gcp-error-reporter';
import { APP_FILTER } from '@nestjs/core';

jest.mock('@google-cloud/error-reporting', () => ({
  ErrorReporting: jest.fn().mockImplementation(() => ({
    report: jest.fn(),
  })),
}));

describe('TelemetryModule', () => {
  it('forRoot() provides GcpErrorReporter', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        TelemetryModule.forRoot({
          serviceName: 'test',
          enabled: false,
        }),
      ],
    }).compile();

    const reporter = moduleRef.get(GcpErrorReporter);
    expect(reporter).toBeDefined();
    expect(typeof reporter.report).toBe('function');
  });

  it('forRoot() includes APP_FILTER in module providers', () => {
    const dynamicModule = TelemetryModule.forRoot({
      serviceName: 'test',
      enabled: false,
    });

    const hasAppFilter = dynamicModule.providers?.some(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === APP_FILTER,
    );
    expect(hasAppFilter).toBe(true);
  });

  it('GcpErrorReporter.report is a no-op when disabled', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        TelemetryModule.forRoot({
          serviceName: 'test',
          enabled: false,
        }),
      ],
    }).compile();

    const reporter = moduleRef.get(GcpErrorReporter);
    expect(() => reporter.report(new Error('test'))).not.toThrow();
  });
});
