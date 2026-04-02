import { rejectAfter } from '../../src';

describe('rejectAfter (docs: health-module — timeout helper for probes)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects after the given delay with a labeled timeout error', async () => {
    const p = rejectAfter(1_000, 'Database');
    jest.advanceTimersByTime(1_000);
    await expect(p).rejects.toThrow(/Database health check timed out after 1000ms/);
  });
});
