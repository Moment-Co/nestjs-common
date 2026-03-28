import { Controller, Get } from '@nestjs/common';
import { MomentLogger } from '../../../src/logging/logger.service';

@Controller('test')
export class TestController {
  constructor(private readonly logger: MomentLogger) {}

  @Get('health')
  health() {
    this.logger.log('health check', 'TestController');
    return { status: 'ok' };
  }
}
