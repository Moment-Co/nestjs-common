import { DynamicModule, Module, ModuleMetadata, Provider } from '@nestjs/common';
import { HealthAggregatorService } from './http/health-aggregator.service';
import { createHealthController } from './http/health.controller';
import { HEALTH_MODULE_OPTIONS } from './core/constants';
import {
  assertHealthModuleOptions,
  type HealthModuleOptions,
} from './core/options';

@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions): DynamicModule {
    assertHealthModuleOptions(options);
    const path = options.path ?? 'health';
    const providers: Provider[] = [
      ...options.checks.map((c) => c.useClass),
      HealthAggregatorService,
      { provide: HEALTH_MODULE_OPTIONS, useValue: options },
    ];
    return {
      module: HealthModule,
      imports: options.imports ?? [],
      controllers: [createHealthController(path)],
      providers,
    };
  }

  /**
   * Same as {@link HealthModule.forRoot} but `criticalKeys` and `path` can come
   * from async configuration (e.g. `ConfigService`). `checks` must still be
   * listed here so Nest can register each injectable check class.
   */
  static forRootAsync(options: {
    imports?: ModuleMetadata['imports'];
    checks: HealthModuleOptions['checks'];
    /** HTTP path for the controller; not available from `useFactory` (route is fixed at compile time). */
    path?: string;
    useFactory: (
      ...args: unknown[]
    ) =>
      | Promise<Pick<HealthModuleOptions, 'criticalKeys'>>
      | Pick<HealthModuleOptions, 'criticalKeys'>;
    inject?: unknown[];
  }): DynamicModule {
    const path = options.path ?? 'health';
    const providers: Provider[] = [
      ...options.checks.map((c) => c.useClass),
      HealthAggregatorService,
      {
        provide: HEALTH_MODULE_OPTIONS,
        useFactory: async (...args: unknown[]) => {
          const partial = await options.useFactory(...args);
          const merged: HealthModuleOptions = {
            checks: options.checks,
            criticalKeys: partial.criticalKeys,
            path,
          };
          assertHealthModuleOptions(merged);
          return merged;
        },
        inject: (options.inject as never[]) ?? [],
      },
    ];
    return {
      module: HealthModule,
      imports: options.imports ?? [],
      controllers: [createHealthController(path)],
      providers,
    };
  }
}
