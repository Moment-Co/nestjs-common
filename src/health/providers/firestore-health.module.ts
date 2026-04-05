import { DynamicModule, Module } from '@nestjs/common';
import { HEALTH_FIRESTORE_CLIENT } from '../checks/firestore.health';

export interface FirestoreHealthModuleOptions {
  /**
   * Pass to resolve a non-default Firebase app: `admin.app(appName).firestore()`.
   * Omit to use the default app (`admin.app()`).
   */
  appName?: string;
}

@Module({})
export class FirestoreHealthModule {
  /**
   * Registers `HEALTH_FIRESTORE_CLIENT` with `firebase-admin`'s Firestore.
   * `firebase-admin` is loaded dynamically so it remains an optional peer.
   *
   * **Your app must call `admin.initializeApp(...)` before this health graph runs.**
   * If no Firebase app is registered (`admin.apps.length === 0`), the library
   * cannot create a client and the token resolves to `undefined` — then
   * `FirestoreHealthCheck` reports `"Firestore not configured"`.
   */
  static register(options?: FirestoreHealthModuleOptions): DynamicModule {
    return {
      module: FirestoreHealthModule,
      providers: [
        {
          provide: HEALTH_FIRESTORE_CLIENT,
          useFactory: () => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const admin = require('firebase-admin');
              if (!admin.apps?.length) {
                return undefined;
              }
              const app = options?.appName?.trim()
                ? admin.app(options.appName.trim())
                : admin.app();
              return app.firestore();
            } catch {
              return undefined;
            }
          },
        },
      ],
      exports: [HEALTH_FIRESTORE_CLIENT],
    };
  }
}
