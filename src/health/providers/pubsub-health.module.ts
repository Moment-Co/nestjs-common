import { DynamicModule, Module } from '@nestjs/common';
import { HEALTH_PUBSUB_CLIENT } from '../checks/pubsub.health';

export interface PubSubHealthModuleOptions {
  /**
   * GCP project ID. Defaults to `process.env.GCP_PROJECT_ID`, then
   * `process.env.GOOGLE_CLOUD_PROJECT` (common with Application Default Credentials).
   */
  projectId?: string;
}

@Module({})
export class PubSubHealthModule {
  /**
   * Registers the `HEALTH_PUBSUB_CLIENT` provider by creating a native
   * `@google-cloud/pubsub` `PubSub` instance. The library is loaded
   * dynamically so it remains an optional peer dependency.
   *
   * If the project ID is not provided (options, `GCP_PROJECT_ID`, or
   * `GOOGLE_CLOUD_PROJECT`) or the library is not installed, the token
   * resolves to `undefined`
   * and `PubSubHealthCheck` reports "Pub/Sub not configured".
   */
  static register(options?: PubSubHealthModuleOptions): DynamicModule {
    return {
      module: PubSubHealthModule,
      providers: [
        {
          provide: HEALTH_PUBSUB_CLIENT,
          useFactory: () => {
            const projectId =
              options?.projectId?.trim() ??
              process.env.GCP_PROJECT_ID?.trim() ??
              process.env.GOOGLE_CLOUD_PROJECT?.trim();
            if (!projectId) return undefined;
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { PubSub } = require('@google-cloud/pubsub');
              return new PubSub({ projectId });
            } catch {
              return undefined;
            }
          },
        },
      ],
      exports: [HEALTH_PUBSUB_CLIENT],
    };
  }
}
