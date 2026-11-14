/**
 * Per-phase display settings used by the "Mission context" card. Modeled on
 * the NASA SpaceX Crew-12 profile: Crew Dragon flies to the ISS, stays docked,
 * then returns the crew to Earth. Values marked `simulated` are made up for
 * the demo.
 *
 * Departure and destination of each phase come from the mission registration
 * in the database (see mission-registry.ts and mission-store.ts).
 */

export const MISSION_PHASES = ["in_orbit", "return_to_earth"] as const;
export type MissionPhase = (typeof MISSION_PHASES)[number];

export function isMissionPhase(value: unknown): value is MissionPhase {
  return typeof value === "string" && (MISSION_PHASES as readonly string[]).includes(value);
}

type PhaseConfig = {
  label: string;
  status: string;
  vehicle: string;
  /** Where the position comes from in this phase. */
  position:
    | { kind: "iss_oem" }
    | { kind: "simulated"; latitude: number; longitude: number; altitudeKm: number; description: string };
  /** Where the cabin temperature comes from in this phase. */
  cabinTemperature:
    | { kind: "iss_historical" }
    | { kind: "simulated"; celsius: number };
};

export const MISSION = {
  phases: {
    in_orbit: {
      label: "In orbit",
      status: "Docked to the ISS",
      vehicle: "Crew Dragon",
      position: { kind: "iss_oem" },
      cabinTemperature: { kind: "iss_historical" },
    },
    return_to_earth: {
      label: "Return to Earth",
      status: "Undocked, descending to splashdown",
      vehicle: "Crew Dragon",
      position: {
        kind: "simulated",
        latitude: 31.2,
        longitude: -121.4,
        altitudeKm: 180,
        description: "Point on the descent toward a Pacific splashdown zone.",
      },
      cabinTemperature: { kind: "simulated", celsius: 23.5 },
    },
  } satisfies Record<MissionPhase, PhaseConfig>,
} as const;
