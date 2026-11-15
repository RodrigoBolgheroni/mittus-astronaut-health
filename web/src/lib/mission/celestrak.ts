/**
 * Position of a spacecraft in free flight, from its orbital elements.
 *
 * CelesTrak publishes the latest elements (OMM/TLE) for every tracked object
 * by NORAD catalog number. The position for a given moment is computed here
 * with the SGP4 model (satellite.js). Accuracy is a few km, which is enough
 * for a map, but it is a computed position, not spacecraft telemetry.
 *
 * CelesTrak updates the elements a few times a day and asks clients not to
 * download the same data more often than every 2 hours.
 */
import { degreesLat, degreesLong, eciToGeodetic, gstime, json2satrec, propagate, type OMMJsonObject } from "satellite.js";

import { createCachedSource, fetchJson } from "./cached-source.ts";

export function celestrakUrl(noradId: number): string {
  return `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=json`;
}

/** Elements older than this give positions that can be hundreds of km off. */
const MAX_ELEMENTS_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export type SpacecraftPosition = {
  latitude: number;
  longitude: number;
  altitudeKm: number;
  /** UTC time the position was computed for. */
  epoch: string;
  /** UTC time of the orbital elements used. */
  elementsEpoch: string;
  source: "celestrak_tle";
};

const REQUIRED_OMM_FIELDS = [
  "EPOCH",
  "MEAN_MOTION",
  "ECCENTRICITY",
  "INCLINATION",
  "RA_OF_ASC_NODE",
  "ARG_OF_PERICENTER",
  "MEAN_ANOMALY",
  "NORAD_CAT_ID",
  "BSTAR",
] as const;

function asOmm(value: unknown): OMMJsonObject {
  if (typeof value !== "object" || value === null) throw new Error("CelesTrak: OMM record is not an object");
  const record = value as Record<string, unknown>;
  for (const field of REQUIRED_OMM_FIELDS) {
    if (record[field] === undefined || record[field] === null) {
      throw new Error(`CelesTrak: OMM record has no ${field}`);
    }
  }
  return value as OMMJsonObject;
}

/** CelesTrak writes EPOCH in UTC without a zone suffix. */
function ommEpoch(omm: OMMJsonObject): Date {
  const raw = String(omm.EPOCH);
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`CelesTrak: invalid EPOCH ${raw}`);
  return date;
}

/** Propagates one OMM record (CelesTrak FORMAT=json) to `at`. */
export function positionFromOmm(record: unknown, at: Date): Omit<SpacecraftPosition, "source"> {
  const omm = asOmm(record);
  const elementsEpoch = ommEpoch(omm);
  if (Math.abs(at.getTime() - elementsEpoch.getTime()) > MAX_ELEMENTS_AGE_MS) {
    throw new Error(`CelesTrak: elements from ${elementsEpoch.toISOString()} are too old for ${at.toISOString()}`);
  }
  const satrec = json2satrec(omm);
  const state = propagate(satrec, at);
  if (!state) throw new Error(`CelesTrak: SGP4 failed for NORAD ${String(omm.NORAD_CAT_ID)}`);
  const geo = eciToGeodetic(state.position, gstime(at));
  return {
    latitude: degreesLat(geo.latitude),
    longitude: degreesLong(geo.longitude),
    altitudeKm: geo.height,
    epoch: at.toISOString(),
    elementsEpoch: elementsEpoch.toISOString(),
  };
}

type ReaderOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  retryAfterMs?: number;
  timeoutMs?: number;
};

/**
 * Returns a function that gives the current position of a spacecraft by
 * NORAD id. Elements are cached per id for 2 hours; if CelesTrak fails, the
 * last downloaded elements keep being used while they are not too old.
 */
export function createSpacecraftPositionReader({
  fetchImpl = fetch,
  now = Date.now,
  ttlMs = 2 * 60 * 60 * 1000,
  retryAfterMs = 10 * 60 * 1000,
  timeoutMs = 10000,
}: ReaderOptions = {}): (noradId: number) => Promise<SpacecraftPosition> {
  const sources = new Map<number, ReturnType<typeof createCachedSource<OMMJsonObject>>>();

  function sourceFor(noradId: number) {
    let source = sources.get(noradId);
    if (!source) {
      source = createCachedSource({
        load: async () => {
          const body = await fetchJson(fetchImpl, celestrakUrl(noradId), timeoutMs);
          if (!Array.isArray(body) || body.length === 0) throw new Error(`CelesTrak: no data for NORAD ${noradId}`);
          return asOmm(body[0]);
        },
        ttlMs,
        retryAfterMs,
        now,
        onError: (error) => console.warn(`CelesTrak unavailable for NORAD ${noradId}:`, error),
      });
      sources.set(noradId, source);
    }
    return source;
  }

  return async (noradId) => {
    const cached = await sourceFor(noradId)();
    if (!cached) throw new Error(`CelesTrak: no orbital elements for NORAD ${noradId}`);
    return { ...positionFromOmm(cached.value, new Date(now())), source: "celestrak_tle" };
  };
}
