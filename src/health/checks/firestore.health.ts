import { Inject, Injectable, Optional } from '@nestjs/common';
import type { HealthCheck } from '../core/health-check.interface';
import type { HealthCheckDetail } from '../core/types';
import { rejectAfter } from '../core/utils';

export const HEALTH_FIRESTORE_CLIENT = Symbol('HEALTH_FIRESTORE_CLIENT');

const DEFAULT_TIMEOUT_MS = 3_000;

/** Dedicated collection/doc for the probe; document may not exist (read still validates connectivity). */
export const FIRESTORE_HEALTH_PROBE_COLLECTION = '__health';
export const FIRESTORE_HEALTH_PROBE_DOC = '__probe';

/**
 * Minimal surface compatible with `firebase-admin` `Firestore` (Admin SDK).
 * Only `collection().doc().get()` is used — no writes.
 */
export interface FirestorePingClient {
  collection(collectionPath: string): {
    doc(documentPath: string): {
      get(): Promise<unknown>;
    };
  };
}

/**
 * Firestore connectivity check via a single document read on
 * {@link FIRESTORE_HEALTH_PROBE_COLLECTION} / {@link FIRESTORE_HEALTH_PROBE_DOC}.
 * The document need not exist; a missing doc still proves API + IAM + network.
 *
 * Bind a `Firestore` instance from `firebase-admin` (`admin.firestore()`) to
 * {@link HEALTH_FIRESTORE_CLIENT}, or use {@link FirestoreHealthModule.register}.
 * If no client is registered, reports `"Firestore not configured"`.
 */
@Injectable()
export class FirestoreHealthCheck implements HealthCheck {
  constructor(
    @Optional()
    @Inject(HEALTH_FIRESTORE_CLIENT)
    private readonly firestore?: FirestorePingClient,
  ) {}

  async check(): Promise<HealthCheckDetail> {
    if (!this.firestore) {
      return {
        status: 'fail',
        responseTimeMs: null,
        error: 'Firestore not configured',
      };
    }

    const start = Date.now();
    try {
      await Promise.race([
        this.firestore
          .collection(FIRESTORE_HEALTH_PROBE_COLLECTION)
          .doc(FIRESTORE_HEALTH_PROBE_DOC)
          .get(),
        rejectAfter(DEFAULT_TIMEOUT_MS, 'Firestore'),
      ]);
      return { status: 'ok', responseTimeMs: Date.now() - start };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'fail', responseTimeMs: null, error: message };
    }
  }
}
