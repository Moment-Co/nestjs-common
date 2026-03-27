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
}
