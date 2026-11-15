/**
 * Client for the "Where the ISS at?" API.
 * Docs: https://wheretheiss.at/w/developer
 *
 * The API computes the position from the latest ISS TLE (NORAD) with the
 * SGP4 model, so it answers for the current second. It is free, needs no key
 * and asks clients to stay at about 1 request per second.
 */

import { createCachedSource, fetchJson } from "./cached-source.ts";

export const WHERE_THE_ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544";

export type IssFix = {
  latitude: number; // degrees, -90..90
  longitude: number; // degrees, -180..180
  altitudeKm: number;
  velocityKmh: number;
  /** "daylight" when the ISS is in sunlight, "eclipsed" in the Earth's shadow. */
  visibility: "daylight" | "eclipsed";
  /** UTC time the position refers to. */
  epoch: string;
};

export type IssPosition = IssFix & {
  source: "wheretheiss" | "wheretheiss_snapshot";
};

function num(body: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`wheretheiss.at: invalid ${key}: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Validates a /v1/satellites/25544 response (units=kilometers). */
export function parseWhereTheIss(body: unknown): IssFix {
  if (typeof body !== "object" || body === null) {
    throw new Error("wheretheiss.at: response is not an object");
  }
  const b = body as Record<string, unknown>;
  if (b.units !== "kilometers") {
    throw new Error(`wheretheiss.at: expected kilometers, got ${JSON.stringify(b.units)}`);
  }
  const timestamp = num(b, "timestamp", 0, Number.MAX_SAFE_INTEGER);
  return {
    latitude: num(b, "latitude", -90, 90),
    longitude: num(b, "longitude", -180, 180),
    altitudeKm: num(b, "altitude", 0, 100000),
    velocityKmh: num(b, "velocity", 0, 100000),
    visibility: b.visibility === "eclipsed" ? "eclipsed" : "daylight",
    epoch: new Date(timestamp * 1000).toISOString(),
  };
}

type ReaderOptions = {
  /** Saved API response, used only when no live response was ever received. */
  snapshot: unknown;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** How long a live position is reused before asking the API again. */
  ttlMs?: number;
  /** How long to wait after a failed request before trying again. */
  retryAfterMs?: number;
  timeoutMs?: number;
};

/**
 * Returns a function that reads the current ISS position.
 *
 * A live response is reused for `ttlMs` (5 s), so many requests to our API
 * turn into at most one request to wheretheiss.at per instance. If the API
 * fails, the last good position is served (its `epoch` tells how old it is);
 * with no good position yet, the bundled snapshot is served.
 */
export function createIssPositionReader({
  snapshot,
  fetchImpl = fetch,
  now = Date.now,
  ttlMs = 5000,
  retryAfterMs = 30000,
  timeoutMs = 5000,
}: ReaderOptions): () => Promise<IssPosition> {
  const read = createCachedSource({
    load: async () => parseWhereTheIss(await fetchJson(fetchImpl, WHERE_THE_ISS_URL, timeoutMs)),
    ttlMs,
    retryAfterMs,
    now,
    onError: (error) => console.warn("wheretheiss.at unavailable, using last known ISS position:", error),
  });

  return async () => {
    const cached = await read();
    if (cached) return { ...cached.value, source: "wheretheiss" };
    return { ...parseWhereTheIss(snapshot), source: "wheretheiss_snapshot" };
  };
}
