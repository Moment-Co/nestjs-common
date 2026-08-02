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

let ApiTags: (name: string) => ClassDecorator;
let ApiOperation: (opts: { summary?: string; description?: string }) => MethodDecorator;
let ApiResponse: (opts: { status?: number; description?: string }) => MethodDecorator;
try {
  // Optional peer — gracefully degrade when @nestjs/swagger is not installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swagger = require('@nestjs/swagger');
  ApiTags = swagger.ApiTags;
  ApiOperation = swagger.ApiOperation;
  ApiResponse = swagger.ApiResponse;
} catch {
  const noop = () => (_target: any, _key?: any, _desc?: any) => {};
  ApiTags = noop as any;
  ApiOperation = noop;
  ApiResponse = noop;
}

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
 * Builds a liveness-only controller for the given route path: "is the process
 * up and serving HTTP" — no dependency checks, always 200. Used as the
 * `path` endpoint when `readinessPath` splits the pair; the only endpoint
 * that may ever be wired to platform restart behavior.
 */
export function createLivenessController(
  path: string,
): Type<{ getLiveness(): HealthCheckResponse }> {
  @ApiTags('Health')
  @Controller(path)
  class MomentLivenessHttpController {
    @Get()
    @HttpCode(200)
    @ApiOperation({
      summary: 'Liveness check',
      description:
        'Process-level liveness only — no dependency checks (those live on the readiness endpoint). ' +
        'Always HTTP 200 while the service can serve requests.',
    })
    @ApiResponse({ status: 200, description: 'Service process is up' })
    getLiveness(): HealthCheckResponse {
      return {
        status: 'ok',
        service: resolveServiceName('app'),
        version: resolveServiceVersion('0.0.0'),
        timestamp: new Date().toISOString(),
        checks: {},
        unhealthyServices: [],
      };
    }
  }

  return MomentLivenessHttpController;
}

/**
 * Builds a controller class for the given route path (e.g. `health`).
 */
export function createHealthController(
  path: string,
): Type<{ getHealth(res: Response): Promise<HealthCheckResponse> }> {
  @ApiTags('Health')
  @Controller(path)
  class MomentHealthHttpController {
    constructor(
      private readonly aggregator: HealthAggregatorService,
      @Inject(HEALTH_MODULE_OPTIONS) private readonly opts: HealthModuleOptions,
    ) {}

    @Get()
    @HttpCode(200)
    @ApiOperation({
      summary: 'Health check',
      description:
        'Returns status of all registered dependency checks. ' +
        'HTTP 200 when healthy or degraded; HTTP 503 when a critical check fails.',
    })
    @ApiResponse({ status: 200, description: 'Service healthy or degraded' })
    @ApiResponse({ status: 503, description: 'Critical dependency unavailable' })
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
