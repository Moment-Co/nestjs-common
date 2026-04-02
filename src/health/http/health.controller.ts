import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Res,
} from '@nestjs/common';
import type { Type } from '@nestjs/common';
import type { Response } from 'express';
import { aggregateHealth } from '../core/aggregate-health';
import type { HealthCheckResponse } from '../core/types';
import { HEALTH_MODULE_OPTIONS } from '../core/constants';
import type { HealthModuleOptions } from '../core/options';
import { HealthAggregatorService } from './health-aggregator.service';

function resolveServiceName(fallback: string): string {
  return process.env.SERVICE_NAME?.trim() || fallback;
}

function resolveServiceVersion(fallback: string): string {
  return (
    process.env.SERVICE_VERSION?.trim() ||
    process.env.npm_package_version?.trim() ||
    fallback
  );
}

/**
 * Builds a controller class for the given route path (e.g. `health`).
 */
export function createHealthController(
  path: string,
): Type<{ getHealth(res: Response): Promise<HealthCheckResponse> }> {
  @Controller(path)
  class MomentHealthHttpController {
    constructor(
      private readonly aggregator: HealthAggregatorService,
      @Inject(HEALTH_MODULE_OPTIONS) private readonly opts: HealthModuleOptions,
    ) {}

    @Get()
    @HttpCode(200)
    async getHealth(
      @Res({ passthrough: true }) res: Response,
    ): Promise<HealthCheckResponse> {
      const checks = await this.aggregator.runAllChecks();
      const { body, httpStatus } = aggregateHealth(
        checks,
        this.opts.criticalKeys,
        resolveServiceName('app'),
        resolveServiceVersion('0.0.0'),
      );
      res.status(httpStatus);
      return body;
    }
  }

  return MomentHealthHttpController;
}
