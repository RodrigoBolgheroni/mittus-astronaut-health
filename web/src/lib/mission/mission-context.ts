import "server-only";

import cabinSample from "@/data/iss-cabin-temperature.json";
import { surfaceDistanceKm } from "./geo";
import { getIssPosition, ISS_OEM_URL, type IssPosition } from "./iss-position";
import { MISSION, type MissionPhase } from "./mission-config";

/** Response of GET /api/mission-context?phase=... */
export type MissionContext = {
  phase: MissionPhase;
  phaseLabel: string;
  status: string;
  vehicle: string;
  location: {
    latitude: number;
    longitude: number;
    altitudeKm: number;
    /** UTC time the position refers to; null for simulated positions. */
    asOf: string | null;
    source: "nasa_iss_oem" | "nasa_iss_oem_snapshot" | "simulated";
    label: string;
    sourceUrl: string | null;
  };
  destination: {
    name: string;
    description: string;
    coordinates: {
      latitude: number;
      longitude: number;
      /** UTC time of the position for a moving target; null for a fixed point. */
      asOf: string | null;
      source: "nasa_iss_oem" | "nasa_iss_oem_snapshot" | "mission_registration" | "simulated";
      label: string;
      sourceUrl: string | null;
    };
    /** Great-circle distance over the surface from the craft; 0 when docked. */
    distanceKm: number;
  };
  cabinTemperature: {
    /** null while no historical sample has been filled in. */
    celsius: number | null;
    measuredAt: string | null;
    source: "iss_historical" | "simulated";
    status: "ok" | "pending_sample";
    label: string;
    sourceUrl: string | null;
  };
  missionReference: { label: string; url: string };
};

const POSITION_LABELS = {
  nasa_iss_oem: "ISS position from NASA trajectory data",
  nasa_iss_oem_snapshot: "ISS position from a saved NASA trajectory sample",
} as const;

/** Fetches the ISS position once per request, only if the phase needs it. */
function issLoader(): () => Promise<IssPosition> {
  let pending: Promise<IssPosition> | null = null;
  return () => (pending ??= getIssPosition());
}

async function buildLocation(
  phase: MissionPhase,
  iss: () => Promise<IssPosition>,
): Promise<MissionContext["location"]> {
  const config = MISSION.phases[phase].position;
  if (config.kind === "simulated") {
    return {
      latitude: config.latitude,
      longitude: config.longitude,
      altitudeKm: config.altitudeKm,
      asOf: null,
      source: "simulated",
      label: `Simulated: ${config.description}`,
      sourceUrl: null,
    };
  }
  const pos = await iss();
  return {
    latitude: round(pos.latitude, 3),
    longitude: round(pos.longitude, 3),
    altitudeKm: round(pos.altitudeKm, 1),
    asOf: pos.epoch,
    source: pos.source,
    label: POSITION_LABELS[pos.source],
    sourceUrl: ISS_OEM_URL,
  };
}

async function buildDestinationCoordinates(
  phase: MissionPhase,
  iss: () => Promise<IssPosition>,
): Promise<MissionContext["destination"]["coordinates"]> {
  const target = MISSION.phases[phase].destination.target;
  if (target.kind === "fixed") {
    return {
      latitude: target.latitude,
      longitude: target.longitude,
      asOf: null,
      source: target.simulated ? "simulated" : "mission_registration",
      label: target.simulated ? `Simulated: ${target.label}` : target.label,
      sourceUrl: target.sourceUrl,
    };
  }
  const pos = await iss();
  return {
    latitude: round(pos.latitude, 3),
    longitude: round(pos.longitude, 3),
    asOf: pos.epoch,
    source: pos.source,
    label: POSITION_LABELS[pos.source],
    sourceUrl: ISS_OEM_URL,
  };
}

function buildCabinTemperature(phase: MissionPhase): MissionContext["cabinTemperature"] {
  const config = MISSION.phases[phase].cabinTemperature;
  if (config.kind === "simulated") {
    return {
      celsius: config.celsius,
      measuredAt: null,
      source: "simulated",
      status: "ok",
      label: "Simulated Crew Dragon cabin temperature",
      sourceUrl: null,
    };
  }
  const celsius = cabinSample.celsius as number | null;
  return {
    celsius,
    measuredAt: cabinSample.measuredAt as string | null,
    source: "iss_historical",
    status: celsius === null ? "pending_sample" : "ok",
    label: "ISS historical",
    sourceUrl: cabinSample.sourceUrl,
  };
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export async function getMissionContext(phase: MissionPhase): Promise<MissionContext> {
  const config = MISSION.phases[phase];
  const iss = issLoader();
  const [location, coordinates] = await Promise.all([
    buildLocation(phase, iss),
    buildDestinationCoordinates(phase, iss),
  ]);
  return {
    phase,
    phaseLabel: config.label,
    status: config.status,
    vehicle: config.vehicle,
    location,
    destination: {
      name: config.destination.name,
      description: config.destination.description,
      coordinates,
      distanceKm: round(surfaceDistanceKm(location, coordinates), 1),
    },
    cabinTemperature: buildCabinTemperature(phase),
    missionReference: MISSION.reference,
  };
}
