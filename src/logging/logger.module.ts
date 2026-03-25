import { DynamicModule, Module } from '@nestjs/common';
import { MomentLogger, LoggerOptions } from './logger.service';

@Module({})
export class LoggerModule {
  static forRoot(options: LoggerOptions): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        { provide: 'LOGGER_OPTIONS', useValue: options },
        {
          provide: MomentLogger,
          useFactory: () => new MomentLogger(options),
        },
      ],
      exports: [MomentLogger],
      global: true,
    };
  }
}
