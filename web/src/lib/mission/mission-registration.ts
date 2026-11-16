/**
 * Validation of the "Register a mission" form (Figma 111:1728) against the
 * constraints of supabase/migrations/20261114220000_create_missions.sql.
 *
 * Pure (no database or Next.js imports) so it can be unit tested; the insert
 * lives in mission-store.ts.
 */

import type { MissionRegistrationInput } from "../api/types.ts";
import { MISSION_PHASES, type MissionPhase } from "./mission-config.ts";

export const DEPARTURE_TIME_SOURCES = ["ll2", "mission_registration", "manual", "simulated"] as const;
export type DepartureTimeSourceInput = (typeof DEPARTURE_TIME_SOURCES)[number];

/** Labels of the "Source of departure time" select. */
export const DEPARTURE_TIME_SOURCE_LABEL: Record<DepartureTimeSourceInput, string> = {
  ll2: "Launch Library 2",
  mission_registration: "Mission registration",
  manual: "Entered by hand",
  simulated: "Simulated",
};

type LegInput = MissionRegistrationInput["legs"][MissionPhase];

export type MissionRegistration = {
  name: string;
  code: string;
  noradId: number | null;
  ll2LaunchId: string | null;
  referenceLabel: string | null;
  referenceUrl: string | null;
  legs: Record<
    MissionPhase,
    {
      departurePlace: string;
      destinationPlace: string;
      departureAt: string | null;
      departureAtSource: DepartureTimeSourceInput | null;
      destinationDescription: string;
    }
  >;
};

/** Field path (e.g. "code", "legs.in_orbit.departureAt") -> message. */
export type RegistrationErrors = Record<string, string>;

export type ValidationResult = { ok: true; value: MissionRegistration } | { ok: false; errors: RegistrationErrors };

const CODE = /^[a-z0-9-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACE_CODE = /^[a-z0-9_]+$/;

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Parses a UTC date-time typed as "YYYY-MM-DD HH:MM" (or an ISO string). */
export function parseUtcDateTime(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "00"] = m;
  const date = new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s));
  // Reject overflow such as 2026-02-31.
  if (date.getUTCMonth() !== +mo! - 1 || date.getUTCDate() !== +d! || +h! > 23 || +mi! > 59) return null;
  return date.toISOString();
}

export function validateRegistration(input: unknown): ValidationResult {
  const body = (input && typeof input === "object" ? input : {}) as Partial<MissionRegistrationInput> & { isDemo?: unknown };
  const errors: RegistrationErrors = {};
  if (body.isDemo === true) errors.isDemo = "Demo selection is not available through public registration.";

  const name = text(body.name);
  if (!name) errors.name = "Enter a mission name.";

  const code = text(body.code);
  if (!code) errors.code = "Enter a mission code.";
  else if (!CODE.test(code)) errors.code = "Use lowercase letters, numbers and hyphens.";

  const noradRaw = text(body.noradId);
  let noradId: number | null = null;
  if (noradRaw) {
    noradId = /^\d+$/.test(noradRaw) ? Number(noradRaw) : NaN;
    if (!Number.isSafeInteger(noradId) || noradId <= 0) errors.noradId = "Use a positive whole number.";
  }

  const ll2 = text(body.ll2LaunchId);
  if (ll2 && !UUID.test(ll2)) errors.ll2LaunchId = "Use the launch UUID from Launch Library 2.";

  const referenceLabel = text(body.referenceLabel);
  const referenceUrl = text(body.referenceUrl);
  // "https://" is the field's starting text: treat it as empty.
  const url = referenceUrl === "https://" ? "" : referenceUrl;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
    } catch {
      errors.referenceUrl = "Enter a full web address.";
    }
  }

  const legs = {} as MissionRegistration["legs"];
  for (const phase of MISSION_PHASES) {
    const leg = (body.legs?.[phase] ?? {}) as Partial<LegInput>;
    const at = `legs.${phase}`;
    const departurePlace = text(leg.departurePlace);
    const destinationPlace = text(leg.destinationPlace);
    if (!PLACE_CODE.test(departurePlace)) errors[`${at}.departurePlace`] = "Select a departure place.";
    if (!PLACE_CODE.test(destinationPlace)) errors[`${at}.destinationPlace`] = "Select a destination place.";
    else if (departurePlace === destinationPlace)
      errors[`${at}.destinationPlace`] = "Choose a destination different from the departure.";

    const departureRaw = text(leg.departureAt);
    const departureAt = departureRaw ? parseUtcDateTime(departureRaw) : null;
    if (departureRaw && !departureAt) errors[`${at}.departureAt`] = "Use YYYY-MM-DD HH:MM (UTC).";

    const sourceRaw = text(leg.departureAtSource);
    const departureAtSource = (DEPARTURE_TIME_SOURCES as readonly string[]).includes(sourceRaw)
      ? (sourceRaw as DepartureTimeSourceInput)
      : null;
    if (sourceRaw && !departureAtSource) errors[`${at}.departureAtSource`] = "Select a source.";
    // The database requires both or neither (mission_legs_departure_source_check).
    if (departureRaw && !sourceRaw) errors[`${at}.departureAtSource`] = "Add the source of the departure time.";
    if (!departureRaw && sourceRaw) errors[`${at}.departureAt`] = "Enter the departure time for this source.";

    const destinationDescription = text(leg.destinationDescription);
    if (!destinationDescription) errors[`${at}.destinationDescription`] = "Describe the destination.";

    legs[phase] = { departurePlace, destinationPlace, departureAt, departureAtSource, destinationDescription };
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      code,
      noradId,
      ll2LaunchId: ll2 || null,
      referenceLabel: referenceLabel || null,
      referenceUrl: url || null,
      legs,
    },
  };
}
