import { Test } from '@nestjs/testing';
import { TestAppModule } from './app/test.module';
import { MomentLogger } from '../../src/logging/logger.service';
import { INestApplication } from '@nestjs/common';

describe('Integration — LoggerModule', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots and resolves MomentLogger from DI', () => {
    const logger = app.get(MomentLogger);
    expect(logger).toBeDefined();
    expect(() => logger.log('integration test passing')).not.toThrow();
  });
});
