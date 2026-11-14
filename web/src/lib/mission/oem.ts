/**
 * Parser for the NASA ISS trajectory file (CCSDS OEM 2.0 in XML).
 * Source: https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.xml
 *
 * Each <stateVector> holds an EPOCH (UTC) plus X, Y, Z in km in the EME2000
 * (J2000) inertial frame. Vectors are spaced 4 minutes apart and the file
 * covers about 15 days.
 */

export type StateVector = {
  /** Epoch in UTC. */
  epoch: Date;
  /** Position in km, EME2000 (J2000) frame. */
  x: number;
  y: number;
  z: number;
};

/**
 * Parses an OEM epoch. The NASA file uses day-of-year format
 * ("2026-317T12:00:00.000Z"), but CCSDS also allows calendar format
 * ("2026-11-13T12:00:00.000Z"), so both are accepted.
 */
export function parseOemEpoch(raw: string): Date {
  const value = raw.trim();
  const dayOfYear = /^(\d{4})-(\d{3})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z?$/.exec(value);
  if (dayOfYear) {
    const [, year, doy, hh, mm, ss] = dayOfYear;
    const seconds = Number(ss);
    // Date.UTC rolls day N of January over into the right month.
    const ms = Date.UTC(Number(year), 0, Number(doy), Number(hh), Number(mm), 0) + seconds * 1000;
    return new Date(ms);
  }
  const calendar = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(calendar.getTime())) {
    throw new Error(`Invalid OEM epoch: ${raw}`);
  }
  return calendar;
}

const STATE_VECTOR_RE = /<stateVector>([\s\S]*?)<\/stateVector>/g;

function readTag(block: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(block);
  if (!match) throw new Error(`Missing <${tag}> in OEM state vector`);
  return match[1];
}

/** Extracts every state vector from the OEM XML, in file order. */
export function parseOemStateVectors(xml: string): StateVector[] {
  const vectors: StateVector[] = [];
  for (const [, block] of xml.matchAll(STATE_VECTOR_RE)) {
    vectors.push({
      epoch: parseOemEpoch(readTag(block, "EPOCH")),
      x: Number(readTag(block, "X")),
      y: Number(readTag(block, "Y")),
      z: Number(readTag(block, "Z")),
    });
  }
  if (vectors.length === 0) {
    throw new Error("OEM file has no state vectors");
  }
  return vectors;
}

/**
 * Picks the latest vector whose epoch is not after `at`. Returns null when
 * `at` is before the first vector or more than `maxAgeMs` past the last one,
 * which means the file no longer covers that moment.
 */
export function pickStateVector(
  vectors: StateVector[],
  at: Date,
  maxAgeMs = 10 * 60 * 1000,
): StateVector | null {
  const t = at.getTime();
  let best: StateVector | null = null;
  for (const v of vectors) {
    if (v.epoch.getTime() <= t) best = v;
    else break;
  }
  if (!best || t - best.epoch.getTime() > maxAgeMs) return null;
  return best;
}
