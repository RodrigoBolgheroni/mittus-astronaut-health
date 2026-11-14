/**
 * Mission registration: where each leg departs from and where it is heading.
 * Stored in the database (tables missions, mission_legs, mission_places and
 * session_missions; see supabase/migrations/20261114220000_create_missions.sql).
 *
 * This module is pure (no database or Next.js imports) so it can be unit
 * tested; mission-store.ts does the querying.
 */

import type { MissionPhase } from "./mission-config.ts";

export type FixedPlaceSource = "ll2" | "mission_registration" | "manual";
export type DepartureTimeSource = FixedPlaceSource | "simulated";

/**
 * A `tracked` place moves (the API resolves its position live from wheretheiss.at);
 * a `fixed` place is a coordinate, such as a launch pad or a splashdown zone.
 */
export type MissionPlace =
  | { kind: "tracked"; object: "iss"; name: string; label: string }
  | {
      kind: "fixed";
      name: string;
      label: string;
      latitude: number;
      longitude: number;
      source: FixedPlaceSource;
      simulated: boolean;
      sourceUrl: string | null;
    };

export type MissionLeg = {
  mission: {
    code: string;
    name: string;
    reference: { label: string; url: string } | null;
    /** NORAD catalog number of the craft, used for its CelesTrak elements; null if unknown. */
    noradId: number | null;
    /** Where this registration was read from. */
    origin: "database" | "built_in";
  };
  phase: MissionPhase;
  departure: { place: MissionPlace; at: string | null; atSource: DepartureTimeSource | null };
  destination: { place: MissionPlace; description: string };
};

/** One row of the leg query in mission-store.ts (dep_* = departure, dst_* = destination). */
export type MissionLegRow = {
  mission_code: string;
  mission_name: string;
  norad_id: number | null;
  reference_label: string | null;
  reference_url: string | null;
  phase: string;
  departure_at: Date | string | null;
  departure_at_source: string | null;
  destination_description: string;
} & PlaceColumns<"dep_"> &
  PlaceColumns<"dst_">;

type PlaceColumns<P extends string> = {
  [K in `${P}${"name" | "label" | "kind" | "tracked_object" | "source" | "source_url"}`]: string | null;
} & { [K in `${P}${"latitude" | "longitude"}`]: number | null } & { [K in `${P}simulated`]: boolean };

function placeFromRow(row: MissionLegRow, prefix: "dep_" | "dst_"): MissionPlace {
  const col = (name: string) => (row as unknown as Record<string, unknown>)[`${prefix}${name}`];
  const name = String(col("name"));
  const label = String(col("label"));
  if (col("kind") === "tracked") {
    const object = col("tracked_object");
    if (object !== "iss") throw new Error(`Unsupported tracked object: ${String(object)}`);
    return { kind: "tracked", object, name, label };
  }
  return {
    kind: "fixed",
    name,
    label,
    latitude: Number(col("latitude")),
    longitude: Number(col("longitude")),
    source: col("source") as FixedPlaceSource,
    simulated: Boolean(col("simulated")),
    sourceUrl: (col("source_url") as string | null) ?? null,
  };
}

export function legFromRow(row: MissionLegRow): MissionLeg {
  const at = row.departure_at;
  return {
    mission: {
      code: row.mission_code,
      name: row.mission_name,
      reference:
        row.reference_label && row.reference_url
          ? { label: row.reference_label, url: row.reference_url }
          : null,
      noradId: row.norad_id == null ? null : Number(row.norad_id),
      origin: "database",
    },
    phase: row.phase as MissionPhase,
    departure: {
      place: placeFromRow(row, "dep_"),
      at: at === null ? null : new Date(at).toISOString(),
      atSource: row.departure_at_source as DepartureTimeSource | null,
    },
    destination: { place: placeFromRow(row, "dst_"), description: row.destination_description },
  };
}

// Same values as the demo mission seeded by the migration. Used only when the
// database is not configured or cannot be reached, so the demo keeps working.
const CAPE_CANAVERAL_SLC_40: MissionPlace = {
  kind: "fixed",
  name: "Cape Canaveral",
  label: "Space Launch Complex 40, Cape Canaveral SFS, FL, USA",
  latitude: 28.56194122,
  longitude: -80.57735736,
  source: "ll2",
  simulated: false,
  sourceUrl: "https://ll.thespacedevs.com/2.3.0/launches/862b54e3-7bf8-48e5-8cd1-d77257d5fde9/",
};
const ISS: MissionPlace = {
  kind: "tracked",
  object: "iss",
  name: "International Space Station",
  label: "International Space Station",
};
const PACIFIC_SPLASHDOWN: MissionPlace = {
  kind: "fixed",
  name: "Earth",
  label: "Pacific splashdown zone off California",
  latitude: 32.6,
  longitude: -118.2,
  source: "manual",
  simulated: true,
  sourceUrl: null,
};

const BUILT_IN_MISSION: MissionLeg["mission"] = {
  code: "demo-crew-12",
  name: "Mittus demo mission",
  reference: {
    label: "NASA SpaceX Crew-12 mission profile",
    url: "https://www.nasa.gov/mission/nasas-spacex-crew-12/",
  },
  noradId: null,
  origin: "built_in",
};

export const BUILT_IN_DEMO_LEGS: Record<MissionPhase, MissionLeg> = {
  in_orbit: {
    mission: BUILT_IN_MISSION,
    phase: "in_orbit",
    departure: { place: CAPE_CANAVERAL_SLC_40, at: "2026-02-13T10:15:56.000Z", atSource: "ll2" },
    destination: {
      place: ISS,
      description: "Crew Dragon flew to the ISS and stays docked while the crew lives aboard.",
    },
  },
  return_to_earth: {
    mission: BUILT_IN_MISSION,
    phase: "return_to_earth",
    departure: { place: ISS, at: null, atSource: null },
    destination: {
      place: PACIFIC_SPLASHDOWN,
      description: "Crew Dragon brings the crew back to a splashdown zone in the ocean.",
    },
  },
};
