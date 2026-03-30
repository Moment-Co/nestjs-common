import { DynamicModule, Module } from '@nestjs/common';
import { HttpClientService, HttpClientOptions } from './http-client.service';

@Module({})
export class HttpClientModule {
  static forRoot(options: HttpClientOptions = {}): DynamicModule {
    return {
      module: HttpClientModule,
      providers: [
        { provide: 'HTTP_CLIENT_OPTIONS', useValue: options },
        {
          provide: HttpClientService,
          useFactory: () => new HttpClientService(options),
        },
      ],
      exports: [HttpClientService],
    };
  }

  static forRootAsync(options: {
    useFactory: (...args: unknown[]) => HttpClientOptions | Promise<HttpClientOptions>;
    inject?: unknown[];
  }): DynamicModule {
    return {
      module: HttpClientModule,
      providers: [
        {
          provide: 'HTTP_CLIENT_OPTIONS',
          useFactory: options.useFactory,
          inject: (options.inject as never[]) ?? [],
        },
        {
          provide: HttpClientService,
          useFactory: (httpOptions: HttpClientOptions) => new HttpClientService(httpOptions),
          inject: ['HTTP_CLIENT_OPTIONS'],
        },
      ],
      exports: [HttpClientService],
    };
  }
}
