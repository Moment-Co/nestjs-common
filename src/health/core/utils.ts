/**
 * Race helper for dependency probes with a timeout.
 */
export function rejectAfter(ms: number, label: string): Promise<never> {
  return new Promise((_resolve, reject) =>
    setTimeout(
      () => reject(new Error(`${label} health check timed out after ${ms}ms`)),
      ms,
    ),
  );
}
