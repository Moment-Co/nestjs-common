import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildPostgresTypeOrmOptions, DatabaseModuleOptions } from './database.config';

@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [TypeOrmModule.forRoot(buildPostgresTypeOrmOptions(options))],
      exports: [TypeOrmModule],
    };
  }

  static forRootAsync(options: {
    useFactory: (...args: unknown[]) => DatabaseModuleOptions | Promise<DatabaseModuleOptions>;
    inject?: unknown[];
  }): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
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
