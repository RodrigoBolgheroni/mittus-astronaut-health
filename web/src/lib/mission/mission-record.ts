/**
 * Mission registry rows (supabase/migrations/20261114220000_create_missions.sql)
 * and their mapping to the shape the mission context uses.
 */
import type { CurrentPositionConfig, MissionPhase, SimulatedPoint } from "./mission-config.ts";

type FixedSource = "ll2" | "mission_registration" | "manual";

/** public.mission_places, as returned by to_jsonb(). */
export type PlaceRow = {
  code: string;
  name: string;
  label: string;
  kind: "tracked" | "fixed";
  tracked_object: "iss" | null;
  latitude: number | null;
  longitude: number | null;
  source: FixedSource | null;
  simulated: boolean;
  source_url: string | null;
};

/** public.missions */
export type MissionRow = {
  id: string;
  code: string;
  name: string;
  norad_id: number | null;
  reference_label: string | null;
  reference_url: string | null;
};

/** public.mission_legs joined with its two places. */
export type MissionLegRow = {
  phase: MissionPhase;
  departure_at: Date | null;
  departure_at_source: FixedSource | "simulated" | null;
  destination_description: string;
  departure_place: PlaceRow;
  destination_place: PlaceRow;
};

export type Place =
  | { kind: "iss"; code: string; name: string; label: string }
  | {
      kind: "fixed";
      code: string;
      name: string;
      label: string;
      latitude: number;
      longitude: number;
      source: FixedSource;
      simulated: boolean;
      sourceUrl: string | null;
    };

export type PositionSource =
  | { kind: "iss" }
  | { kind: "spacecraft_tle"; noradId: number }
  | ({ kind: "simulated" } & SimulatedPoint);

export type MissionLegRecord = {
  mission: {
    id: string;
    code: string;
    name: string;
    reference: { label: string; url: string } | null;
  };
  phase: MissionPhase;
  departure: { place: Place; departedAt: string | null; departedAtSource: MissionLegRow["departure_at_source"] };
  destination: { place: Place; description: string };
  position: PositionSource;
};

function required<T>(value: T | null | undefined, what: string, code: string): T {
  if (value === null || value === undefined) throw new Error(`Mission place ${code} is missing ${what}`);
  return value;
}

export function toPlace(row: PlaceRow): Place {
  if (row.kind === "tracked") {
    const object = required(row.tracked_object, "tracked_object", row.code);
    if (object !== "iss") throw new Error(`Mission place ${row.code} tracks an unknown object: ${String(object)}`);
    return { kind: "iss", code: row.code, name: row.name, label: row.label };
  }
  return {
    kind: "fixed",
    code: row.code,
    name: row.name,
    label: row.label,
    latitude: required(row.latitude, "latitude", row.code),
    longitude: required(row.longitude, "longitude", row.code),
    source: required(row.source, "source", row.code),
    simulated: row.simulated,
    sourceUrl: row.source_url,
  };
}

function toPosition(mission: MissionRow, config: CurrentPositionConfig): PositionSource {
  if (config.kind === "iss") return { kind: "iss" };
  if (mission.norad_id !== null) return { kind: "spacecraft_tle", noradId: mission.norad_id };
  return { kind: "simulated", ...config.simulated };
}

export function toMissionLegRecord(
  mission: MissionRow,
  leg: MissionLegRow,
  currentPosition: CurrentPositionConfig,
): MissionLegRecord {
  return {
    mission: {
      id: mission.id,
      code: mission.code,
      name: mission.name,
      reference:
        mission.reference_label && mission.reference_url
          ? { label: mission.reference_label, url: mission.reference_url }
          : null,
    },
    phase: leg.phase,
    departure: {
      place: toPlace(leg.departure_place),
      departedAt: leg.departure_at ? leg.departure_at.toISOString() : null,
      departedAtSource: leg.departure_at_source,
    },
    destination: { place: toPlace(leg.destination_place), description: leg.destination_description },
    position: toPosition(mission, currentPosition),
  };
}
