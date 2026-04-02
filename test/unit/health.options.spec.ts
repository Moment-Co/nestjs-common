import { Injectable } from '@nestjs/common';
import {
  assertHealthModuleOptions,
  type HealthCheck,
  type HealthCheckDetail,
} from '../../src';

@Injectable()
class DummyCheck implements HealthCheck {
  async check(): Promise<HealthCheckDetail> {
    return { status: 'ok', responseTimeMs: 0 };
  }
}

describe('assertHealthModuleOptions (docs: criticalKeys must match registered check keys)', () => {
  it('does not throw when every critical key is registered', () => {
    expect(() =>
      assertHealthModuleOptions({
        checks: [{ key: 'alpha', useClass: DummyCheck }],
        criticalKeys: ['alpha'],
      }),
    ).not.toThrow();
  });

  it('throws when criticalKeys references a missing check key', () => {
    expect(() =>
      assertHealthModuleOptions({
        checks: [{ key: 'alpha', useClass: DummyCheck }],
        criticalKeys: ['not-registered'],
      }),
    ).toThrow(/criticalKeys contains "not-registered"/);
  });
});
