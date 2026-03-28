import { Module } from '@nestjs/common';
import { LoggerModule } from '../../../src/logging/logger.module';
import { TestController } from './test.controller';

@Module({
  imports: [LoggerModule.forRoot({ service: 'integration-test' })],
  controllers: [TestController],
})
export class TestAppModule {}
