import { Test, TestingModule } from '@nestjs/testing';
import { FirestoreHealthModule } from '../../src/health/providers/firestore-health.module';
import { HEALTH_FIRESTORE_CLIENT } from '../../src/health/checks/firestore.health';

function isFirebaseAdminResolvable(): boolean {
  try {
    require.resolve('firebase-admin');
    return true;
  } catch {
    return false;
  }
}

describe('FirestoreHealthModule', () => {
  it('register() provides undefined when firebase-admin is missing or no initialized app', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [FirestoreHealthModule.register()],
    }).compile();

    const client = moduleRef.get(HEALTH_FIRESTORE_CLIENT);
    if (!isFirebaseAdminResolvable()) {
      expect(client).toBeUndefined();
      return;
    }

    // Package present but tests never call initializeApp → no apps
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin');
    if (!admin.apps?.length) {
      expect(client).toBeUndefined();
    } else {
      expect(client).toBeDefined();
    }
  });

  it('register({ appName }) yields undefined when app is not registered', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FirestoreHealthModule.register({ appName: 'nonexistent-app' })],
    }).compile();

    expect(moduleRef.get(HEALTH_FIRESTORE_CLIENT)).toBeUndefined();
  });
});
