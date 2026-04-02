import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseHealthCheck } from '../../src/health/checks/database.health';

describe('DatabaseHealthCheck', () => {
  it('returns ok when SELECT 1 succeeds', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as DataSource;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthCheck,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    const check = moduleRef.get(DatabaseHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('ok');
    expect(result.responseTimeMs).not.toBeNull();
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns fail when query throws', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as DataSource;

    const moduleRef = await Test.createTestingModule({
      providers: [
        DatabaseHealthCheck,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    const check = moduleRef.get(DatabaseHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.responseTimeMs).toBeNull();
    expect(result.error).toBe('connection refused');
  });
});
