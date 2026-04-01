import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DatabaseEnv } from '../config/database-env.schema';
import {
  buildPostgresTypeOrmOptions,
  DatabaseModuleLayout,
  DatabaseModuleOptions,
  databaseEnvToModuleOptions,
  mergeDatabaseModuleOptions,
} from './database.config';

@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [TypeOrmModule.forRoot(buildPostgresTypeOrmOptions(options))],
      exports: [TypeOrmModule],
    };
  }

  static forRootFromEnv(
    env: DatabaseEnv,
    layout: DatabaseModuleLayout,
    overrides?: Partial<DatabaseModuleOptions>,
  ): DynamicModule {
    const merged = mergeDatabaseModuleOptions(databaseEnvToModuleOptions(env, layout), overrides);
    return DatabaseModule.forRoot(merged);
  }

  static forRootAsync(options: {
    imports?: ModuleMetadata['imports'];
    useFactory: (...args: unknown[]) => DatabaseModuleOptions | Promise<DatabaseModuleOptions>;
    inject?: unknown[];
  }): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: options.imports ?? [],
          useFactory: async (...args: unknown[]) => {
            const dbOptions = await options.useFactory(...args);
            return buildPostgresTypeOrmOptions(dbOptions);
          },
          inject: (options.inject as never[]) ?? [],
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}
