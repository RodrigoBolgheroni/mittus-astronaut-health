/**
 * In-memory cache for a remote source, shared by every request on a server
 * instance.
 *
 * - Reuses a good value for `ttlMs`.
 * - Concurrent callers share the same in-flight load.
 * - After a failure, waits `retryAfterMs` before loading again.
 * - When loading fails, returns the last good value (marked `fresh: false`),
 *   or null if there never was one.
 */
export type CachedSourceOptions<T> = {
  load: () => Promise<T>;
  ttlMs: number;
  retryAfterMs: number;
  now?: () => number;
  /** Called when a load fails; defaults to console.warn. */
  onError?: (error: unknown) => void;
};

export type CachedValue<T> = { value: T; fresh: boolean };

export function createCachedSource<T>({
  load,
  ttlMs,
  retryAfterMs,
  now = Date.now,
  onError = (error) => console.warn("Remote source unavailable, using last good value:", error),
}: CachedSourceOptions<T>): () => Promise<CachedValue<T> | null> {
  let last: { value: T; loadedAt: number } | null = null;
  let failedAt: number | null = null;
  let inFlight: Promise<T> | null = null;

  function refresh(): Promise<T> {
    inFlight ??= (async () => {
      try {
        const value = await load();
        last = { value, loadedAt: now() };
        failedAt = null;
        return value;
      } catch (error) {
        failedAt = now();
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  const stale = () => (last ? { value: last.value, fresh: false } : null);

  return async () => {
    const t = now();
    if (last && t - last.loadedAt < ttlMs) return { value: last.value, fresh: true };
    if (failedAt !== null && t - failedAt < retryAfterMs) return stale();
    try {
      return { value: await refresh(), fresh: true };
    } catch (error) {
      onError(error);
      return stale();
    }
  };
}

/** Fetches JSON with a timeout; non-2xx answers are errors. */
export async function fetchJson(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}
