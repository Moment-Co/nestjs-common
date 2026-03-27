import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModuleOptions, getPoolConfig } from './database.config';

@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    const pool = getPoolConfig(process.env.NODE_ENV);

    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: options.url,
          entities: options.entities,
          synchronize: options.synchronize ?? false,
          ssl: options.ssl ? { rejectUnauthorized: false } : false,
          extra: {
            max: pool.max,
            min: pool.min,
            idleTimeoutMillis: pool.idleTimeoutMs,
            connectionTimeoutMillis: pool.connectionTimeoutMs,
          },
        }),
      ],
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
            const pool = getPoolConfig(process.env.NODE_ENV);
            return {
              type: 'postgres',
              url: dbOptions.url,
              entities: dbOptions.entities,
              synchronize: dbOptions.synchronize ?? false,
              ssl: dbOptions.ssl ? { rejectUnauthorized: false } : false,
              extra: {
                max: pool.max,
                min: pool.min,
                idleTimeoutMillis: pool.idleTimeoutMs,
                connectionTimeoutMillis: pool.connectionTimeoutMs,
              },
            };
          },
          inject: (options.inject as never[]) ?? [],
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}
