import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { HealthCheckDetail } from '../core/types';
import { HEALTH_MODULE_OPTIONS } from '../core/constants';
import type { HealthModuleOptions } from '../core/options';

@Injectable()
export class HealthAggregatorService {
  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(HEALTH_MODULE_OPTIONS) private readonly options: HealthModuleOptions,
  ) {}

  /**
   * Runs all registered checks in parallel and returns keyed results.
   */
  async runAllChecks(): Promise<Record<string, HealthCheckDetail>> {
    const entries = await Promise.all(
      this.options.checks.map(async ({ key, useClass }) => {
        const checker = this.moduleRef.get(useClass, { strict: false });
        const detail = await checker.check();
        return [key, detail] as const;
      }),
    );
    return Object.fromEntries(entries);
  }
}
