/**
 * Mission profile used by the "Mission context" card. Modeled on the NASA
 * SpaceX Crew-12 profile: Crew Dragon flies to the ISS, stays docked, then
 * returns the crew to Earth. Values marked `simulated` are made up for the demo.
 */

export const MISSION_PHASES = ["in_orbit", "return_to_earth"] as const;
export type MissionPhase = (typeof MISSION_PHASES)[number];

export function isMissionPhase(value: unknown): value is MissionPhase {
  return typeof value === "string" && (MISSION_PHASES as readonly string[]).includes(value);
}

/**
 * What the craft is heading to. A `tracked` target moves (its position is
 * resolved live from NASA data); a `fixed` target is a point on Earth taken
 * from the mission registration, such as an announced splashdown zone.
 */
export type DestinationTarget =
  | { kind: "tracked"; object: "iss" }
  | {
      kind: "fixed";
      latitude: number;
      longitude: number;
      label: string;
      simulated: boolean;
      sourceUrl: string | null;
    };

type PhaseConfig = {
  label: string;
  status: string;
  vehicle: string;
  destination: { name: string; description: string; target: DestinationTarget };
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
  name: "Mittus demo mission",
  reference: {
    label: "NASA SpaceX Crew-12 mission profile",
    url: "https://www.nasa.gov/mission/nasas-spacex-crew-12/",
  },
  phases: {
    in_orbit: {
      label: "In orbit",
      status: "Docked to the ISS",
      vehicle: "Crew Dragon",
      destination: {
        name: "International Space Station",
        description: "Crew Dragon flew to the ISS and stays docked while the crew lives aboard.",
        target: { kind: "tracked", object: "iss" },
      },
      position: { kind: "iss_oem" },
      cabinTemperature: { kind: "iss_historical" },
    },
    return_to_earth: {
      label: "Return to Earth",
      status: "Undocked, descending to splashdown",
      vehicle: "Crew Dragon",
      destination: {
        name: "Earth",
        description: "Crew Dragon brings the crew back to a splashdown zone in the ocean.",
        // Representative point. Replace with the zone NASA announces for the
        // real return, and set simulated: false with the announcement URL.
        target: {
          kind: "fixed",
          latitude: 32.6,
          longitude: -118.2,
          label: "Pacific splashdown zone off California",
          simulated: true,
          sourceUrl: null,
        },
      },
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
