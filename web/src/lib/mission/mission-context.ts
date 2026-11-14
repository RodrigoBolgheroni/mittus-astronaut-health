import "server-only";

import cabinSample from "@/data/iss-cabin-temperature.json";
import { surfaceDistanceKm } from "./geo";
import {
  celestrakUrl,
  getIssPosition,
  getSpacecraftPosition,
  WHERE_THE_ISS_URL,
  type IssPosition,
} from "./live-position";
import { MISSION, type MissionPhase } from "./mission-config";
import type { DepartureTimeSource, MissionLeg, MissionPlace } from "./mission-registry";
import { getMissionLeg } from "./mission-store";

/** Coordinates of a departure or destination point. */
export type PointCoordinates = {
  latitude: number;
  longitude: number;
  /** UTC time of the position for a moving point; null for a fixed point. */
  asOf: string | null;
  source: "wheretheiss" | "wheretheiss_snapshot" | "ll2" | "mission_registration" | "manual" | "simulated";
  label: string;
  sourceUrl: string | null;
};

/** Response of GET /api/mission-context?phase=... */
export type MissionContext = {
  phase: MissionPhase;
  phaseLabel: string;
  status: string;
  vehicle: string;
  mission: {
    code: string;
    name: string;
    /** "built_in" when the database could not be read. */
    registrySource: "database" | "built_in";
  };
  /** Where this leg started. */
  departure: {
    name: string;
    /** UTC departure time (launch, undocking...); null when not registered. */
    departedAt: string | null;
    departedAtSource: DepartureTimeSource | null;
    coordinates: PointCoordinates;
  };
  /** Where the craft is now. */
  location: {
    latitude: number;
    longitude: number;
    altitudeKm: number;
    /** UTC time the position refers to; null for simulated positions. */
    asOf: string | null;
    source: "wheretheiss" | "wheretheiss_snapshot" | "celestrak_tle" | "simulated";
    label: string;
    sourceUrl: string | null;
  };
  /** Where this leg is heading. */
  destination: {
    name: string;
    description: string;
    coordinates: PointCoordinates;
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
  missionReference: { label: string; url: string } | null;
};

const POSITION_LABELS = {
  wheretheiss: "Live ISS position from wheretheiss.at",
  wheretheiss_snapshot: "ISS position from a saved wheretheiss.at sample",
} as const;

/** Fetches the ISS position once per request, only if something needs it. */
function issLoader(): () => Promise<IssPosition> {
  let pending: Promise<IssPosition> | null = null;
  return () => (pending ??= getIssPosition());
}

async function buildLocation(
  leg: MissionLeg,
  iss: () => Promise<IssPosition>,
): Promise<MissionContext["location"]> {
  const config = MISSION.phases[leg.phase];
  const position = config.position;
  if (position.kind === "iss_live") {
    const pos = await iss();
    return {
      latitude: round(pos.latitude, 3),
      longitude: round(pos.longitude, 3),
      altitudeKm: round(pos.altitudeKm, 1),
      asOf: pos.epoch,
      source: pos.source,
      label: POSITION_LABELS[pos.source],
      sourceUrl: WHERE_THE_ISS_URL,
    };
  }
  const noradId = leg.mission.noradId;
  if (noradId !== null) {
    try {
      const pos = await getSpacecraftPosition(noradId);
      return {
        latitude: round(pos.latitude, 3),
        longitude: round(pos.longitude, 3),
        altitudeKm: round(pos.altitudeKm, 1),
        asOf: pos.epoch,
        source: pos.source,
        label: `${config.vehicle} position computed from its orbital elements (CelesTrak)`,
        sourceUrl: celestrakUrl(noradId),
      };
    } catch (error) {
      console.warn(`No CelesTrak position for NORAD ${noradId} - using the simulated point:`, error);
    }
  }
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    altitudeKm: position.altitudeKm,
    asOf: null,
    source: "simulated",
    label: `Simulated: ${position.description}`,
    sourceUrl: null,
  };
}

/** Coordinates of a registered place: fixed as stored, tracked resolved live. */
async function buildPointCoordinates(
  place: MissionPlace,
  iss: () => Promise<IssPosition>,
): Promise<PointCoordinates> {
  if (place.kind === "fixed") {
    return {
      latitude: place.latitude,
      longitude: place.longitude,
      asOf: null,
      source: place.simulated ? "simulated" : place.source,
      label: place.simulated ? `Simulated: ${place.label}` : place.label,
      sourceUrl: place.sourceUrl,
    };
  }
  const pos = await iss();
  return {
    latitude: round(pos.latitude, 3),
    longitude: round(pos.longitude, 3),
    asOf: pos.epoch,
    source: pos.source,
    label: POSITION_LABELS[pos.source],
    sourceUrl: WHERE_THE_ISS_URL,
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

export async function buildMissionContext(leg: MissionLeg): Promise<MissionContext> {
  const config = MISSION.phases[leg.phase];
  const iss = issLoader();
  const [location, departureCoordinates, destinationCoordinates] = await Promise.all([
    buildLocation(leg, iss),
    buildPointCoordinates(leg.departure.place, iss),
    buildPointCoordinates(leg.destination.place, iss),
  ]);
  return {
    phase: leg.phase,
    phaseLabel: config.label,
    status: config.status,
    vehicle: config.vehicle,
    mission: { code: leg.mission.code, name: leg.mission.name, registrySource: leg.mission.origin },
    departure: {
      name: leg.departure.place.name,
      departedAt: leg.departure.at,
      departedAtSource: leg.departure.atSource,
      coordinates: departureCoordinates,
    },
    location,
    destination: {
      name: leg.destination.place.name,
      description: leg.destination.description,
      coordinates: destinationCoordinates,
      distanceKm: round(surfaceDistanceKm(location, destinationCoordinates), 1),
    },
    cabinTemperature: buildCabinTemperature(leg.phase),
    missionReference: leg.mission.reference,
  };
}

/**
 * Mission context of `phase` for the session's mission (or the demo mission).
 * Returns null when that mission has no leg for the phase.
 */
export async function getMissionContext(
  phase: MissionPhase,
  sessionId: string | null = null,
): Promise<MissionContext | null> {
  const leg = await getMissionLeg(phase, sessionId);
  return leg ? buildMissionContext(leg) : null;
}
