/**
 * Settings of the "Mission context" card that the database does not hold.
 *
 * The mission registry (public.missions, mission_legs, mission_places) stores
 * where each leg departs from and where it is heading. The texts, the craft
 * name and how the current position is found in each phase live here.
 */

export const MISSION_PHASES = ["in_orbit", "return_to_earth"] as const;
export type MissionPhase = (typeof MISSION_PHASES)[number];

export function isMissionPhase(value: unknown): value is MissionPhase {
  return typeof value === "string" && (MISSION_PHASES as readonly string[]).includes(value);
}

export const VEHICLE = "Crew Dragon";

export const PHASE_LABELS: Record<MissionPhase, string> = {
  in_orbit: "In orbit",
  return_to_earth: "Return to Earth",
};

export const PHASE_STATUS: Record<MissionPhase, string> = {
  in_orbit: "Docked to the ISS",
  return_to_earth: "Undocked, descending to splashdown",
};

export type SimulatedPoint = {
  latitude: number;
  longitude: number;
  altitudeKm: number;
  description: string;
};

/**
 * How the craft's current position is found in each phase.
 *   iss:              docked, so it is the ISS position (wheretheiss.at).
 *   tle_or_simulated: free flight. Uses the craft's orbital elements on
 *                     CelesTrak when missions.norad_id is filled, otherwise
 *                     the simulated point.
 */
export type CurrentPositionConfig =
  | { kind: "iss" }
  | { kind: "tle_or_simulated"; simulated: SimulatedPoint };

export const CURRENT_POSITION: Record<MissionPhase, CurrentPositionConfig> = {
  in_orbit: { kind: "iss" },
  return_to_earth: {
    kind: "tle_or_simulated",
    simulated: {
      latitude: 31.2,
      longitude: -121.4,
      altitudeKm: 180,
      description: "Point on the descent toward a Pacific splashdown zone.",
    },
  },
};

/** Where the cabin temperature comes from in each phase. */
export const CABIN_TEMPERATURE: Record<
  MissionPhase,
  { kind: "iss_historical" } | { kind: "simulated"; celsius: number }
> = {
  in_orbit: { kind: "iss_historical" },
  return_to_earth: { kind: "simulated", celsius: 23.5 },
};
