import "server-only";

import snapshot from "@/data/iss-oem-snapshot.json";
import { eme2000ToGeodetic, type Geodetic } from "./geo";
import { parseOemEpoch, parseOemStateVectors, pickStateVector, type StateVector } from "./oem";

export const ISS_OEM_URL =
  "https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.xml";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// The download usually takes 2-4 s; some S3 addresses occasionally fail to
// connect, so give it room before falling back to the snapshot.
const FETCH_TIMEOUT_MS = 15000;

export type IssPosition = Geodetic & {
  /** UTC time of the state vector the position was computed from. */
  epoch: string;
  source: "nasa_iss_oem" | "nasa_iss_oem_snapshot";
};

// The file is ~3 MB, above the Next.js fetch cache limit (2 MB), so the
// parsed vectors are cached in memory per server instance instead.
let cache: { vectors: StateVector[]; fetchedAt: number } | null = null;
let inFlight: Promise<StateVector[]> | null = null;

function refresh(): Promise<StateVector[]> {
  inFlight ??= (async () => {
    try {
      const res = await fetch(ISS_OEM_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`ISS OEM request failed: ${res.status}`);
      const vectors = parseOemStateVectors(await res.text());
      cache = { vectors, fetchedAt: Date.now() };
      return vectors;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Stale-while-revalidate: only the first request waits for the download.
 * After that, an expired cache is served immediately while a refresh runs in
 * the background, and a failed refresh keeps the last good copy.
 */
async function loadVectors(): Promise<StateVector[]> {
  if (!cache) return refresh();
  if (Date.now() - cache.fetchedAt >= CACHE_TTL_MS) {
    refresh().catch((error) => console.warn("ISS OEM refresh failed, keeping cached copy:", error));
  }
  return cache.vectors;
}

function toPosition(v: StateVector, source: IssPosition["source"]): IssPosition {
  return {
    ...eme2000ToGeodetic([v.x, v.y, v.z], v.epoch),
    epoch: v.epoch.toISOString(),
    source,
  };
}

/**
 * ISS position at `at`, from the latest NASA state vector at or before it.
 * Falls back to the dated snapshot bundled with the app if the live file
 * cannot be fetched or no longer covers `at`.
 */
export async function getIssPosition(at: Date = new Date()): Promise<IssPosition> {
  try {
    const vector = pickStateVector(await loadVectors(), at);
    if (vector) return toPosition(vector, "nasa_iss_oem");
    console.warn("ISS OEM file does not cover", at.toISOString(), "- using snapshot");
  } catch (error) {
    console.warn("ISS OEM unavailable - using snapshot:", error);
  }
  const s = snapshot.stateVector;
  return toPosition(
    { epoch: parseOemEpoch(s.epoch), x: s.x, y: s.y, z: s.z },
    "nasa_iss_oem_snapshot",
  );
}
