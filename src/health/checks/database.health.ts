import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { HealthCheck } from '../core/health-check.interface';
import type { HealthCheckDetail } from '../core/types';
import { rejectAfter } from '../core/utils';

const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Runs `SELECT 1` against the app {@link DataSource} with a timeout.
 * Requires TypeORM `DataSource` to be available (for example after `TypeOrmModule.forRoot`).
 */
@Injectable()
export class DatabaseHealthCheck implements HealthCheck {
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<HealthCheckDetail> {
    const start = Date.now();
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        rejectAfter(DEFAULT_TIMEOUT_MS, 'Database'),
      ]);
      return { status: 'ok', responseTimeMs: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'fail', responseTimeMs: null, error: message };
    }
  }
}
