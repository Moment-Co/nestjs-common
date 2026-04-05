import { Test, TestingModule } from '@nestjs/testing';
import {
  FirestoreHealthCheck,
  HEALTH_FIRESTORE_CLIENT,
  FIRESTORE_HEALTH_PROBE_COLLECTION,
  FIRESTORE_HEALTH_PROBE_DOC,
} from '../../src/health/checks/firestore.health';

function mockFirestore(getImpl: jest.Mock) {
  const docRef = { get: getImpl };
  const colRef = { doc: jest.fn().mockReturnValue(docRef) };
  return {
    collection: jest.fn().mockReturnValue(colRef),
    colRef,
    docRef,
  };
}

describe('FirestoreHealthCheck', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns fail when no client is bound', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [FirestoreHealthCheck],
    }).compile();

    const check = moduleRef.get(FirestoreHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.error).toBe('Firestore not configured');
  });

  it('returns ok when doc get succeeds', async () => {
    const get = jest.fn().mockResolvedValue({ exists: false });
    const { collection, colRef } = mockFirestore(get);

    const moduleRef = await Test.createTestingModule({
      providers: [
        FirestoreHealthCheck,
        { provide: HEALTH_FIRESTORE_CLIENT, useValue: { collection } },
      ],
    }).compile();

    const check = moduleRef.get(FirestoreHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('ok');
    expect(result.responseTimeMs).not.toBeNull();
    expect(collection).toHaveBeenCalledWith(FIRESTORE_HEALTH_PROBE_COLLECTION);
    expect(colRef.doc).toHaveBeenCalledWith(FIRESTORE_HEALTH_PROBE_DOC);
    expect(get).toHaveBeenCalled();
  });

  it('returns fail when get rejects', async () => {
    const { collection } = mockFirestore(
      jest.fn().mockRejectedValue(new Error('PERMISSION_DENIED')),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        FirestoreHealthCheck,
        { provide: HEALTH_FIRESTORE_CLIENT, useValue: { collection } },
      ],
    }).compile();

    const check = moduleRef.get(FirestoreHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.error).toBe('PERMISSION_DENIED');
  });

  it('returns fail when get exceeds timeout', async () => {
    const get = jest.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ exists: false }), 60_000);
        }),
    );
    const { collection } = mockFirestore(get);

    const moduleRef = await Test.createTestingModule({
      providers: [
        FirestoreHealthCheck,
        { provide: HEALTH_FIRESTORE_CLIENT, useValue: { collection } },
      ],
    }).compile();

    const check = moduleRef.get(FirestoreHealthCheck);
    const resultPromise = check.check();
    jest.advanceTimersByTime(3_000);
    const result = await resultPromise;

    expect(result.status).toBe('fail');
    expect(result.error).toMatch(/Firestore health check timed out after 3000ms/);
  });

  it('returns fail with Unknown error for non-Error rejections', async () => {
    const { collection } = mockFirestore(jest.fn().mockRejectedValue('string-error'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        FirestoreHealthCheck,
        { provide: HEALTH_FIRESTORE_CLIENT, useValue: { collection } },
      ],
    }).compile();

    const check = moduleRef.get(FirestoreHealthCheck);
    const result = await check.check();

    expect(result.status).toBe('fail');
    expect(result.error).toBe('Unknown error');
  });
});
