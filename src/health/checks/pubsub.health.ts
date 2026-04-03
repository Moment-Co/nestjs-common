import { Inject, Injectable, Optional } from '@nestjs/common';
import type { HealthCheck } from '../core/health-check.interface';
import type { HealthCheckDetail } from '../core/types';
import { rejectAfter } from '../core/utils';

export const HEALTH_PUBSUB_CLIENT = Symbol('HEALTH_PUBSUB_CLIENT');

const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Minimal client surface expected from a `@google-cloud/pubsub` PubSub instance.
 * Only the read-only `getTopics` method is used so the probe never writes data.
 */
export interface PubSubPingClient {
  /** Matches `@google-cloud/pubsub` `PubSub#getTopics` return shape (tuple of topic list + …). */
  getTopics(options?: { pageSize?: number }): Promise<unknown>;
}

/**
 * Lightweight Pub/Sub connectivity check. Calls `getTopics({ pageSize: 1 })`
 * to validate credentials, network, and project configuration without
 * publishing any messages.
 *
 * Provide a `@google-cloud/pubsub` `PubSub` instance bound to
 * {@link HEALTH_PUBSUB_CLIENT}. If no client is registered the check
 * reports `"Pub/Sub not configured"`.
 */
@Injectable()
export class PubSubHealthCheck implements HealthCheck {
  constructor(
    @Optional() @Inject(HEALTH_PUBSUB_CLIENT) private readonly pubsub?: PubSubPingClient,
  ) {}

  async check(): Promise<HealthCheckDetail> {
    if (!this.pubsub) {
      return {
        status: 'fail',
        responseTimeMs: null,
        error: 'Pub/Sub not configured',
      };
    }

    const start = Date.now();
    try {
      await Promise.race([
        this.pubsub.getTopics({ pageSize: 1 }),
        rejectAfter(DEFAULT_TIMEOUT_MS, 'PubSub'),
      ]);
      return { status: 'ok', responseTimeMs: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'fail', responseTimeMs: null, error: message };
    }
  }
}
