/**
 * Coalesce identical in-flight async work (StrictMode double-mounts, remounts).
 * Keyed callers share one promise until it settles.
 */
const inflight = new Map<string, Promise<unknown>>();

export function onceInflight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending = run().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}
