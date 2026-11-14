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
import { CABIN_TEMPERATURE, PHASE_LABELS, PHASE_STATUS, VEHICLE, type MissionPhase } from "./mission-config";
import type { MissionLegRecord, Place } from "./mission-record";
import { loadMissionLeg } from "./mission-repository";

/** Coordinates of a departure or destination place. */
export type PlaceCoordinates = {
  latitude: number;
  longitude: number;
  /** UTC time of the position for a moving place (the ISS); null for a fixed point. */
  asOf: string | null;
  /**
   * wheretheiss / wheretheiss_snapshot: the ISS, resolved live.
   * ll2 / mission_registration / manual: fixed point and where it came from.
   * simulated: fixed point made up for the demo.
   */
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
  mission: { code: string; name: string };
  /** Where this leg departs from. */
  departure: {
    name: string;
    /** UTC departure time; null when not registered. */
    departedAt: string | null;
    departedAtSource: "ll2" | "mission_registration" | "manual" | "simulated" | null;
    coordinates: PlaceCoordinates;
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
    coordinates: PlaceCoordinates;
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

/** No mission (or no leg for the phase) is registered in the database. */
export class MissionNotRegisteredError extends Error {
  constructor(phase: MissionPhase) {
    super(`No mission registered for phase ${phase}`);
  }
}

const ISS_LABELS = {
  wheretheiss: "Live ISS position from wheretheiss.at",
  wheretheiss_snapshot: "ISS position from a saved wheretheiss.at sample",
} as const;

/** Fetches the ISS position once per request, only if the leg needs it. */
function issLoader(): () => Promise<IssPosition> {
  let pending: Promise<IssPosition> | null = null;
  return () => (pending ??= getIssPosition());
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

async function placeCoordinates(place: Place, iss: () => Promise<IssPosition>): Promise<PlaceCoordinates> {
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
    label: ISS_LABELS[pos.source],
    sourceUrl: WHERE_THE_ISS_URL,
  };
}

async function buildLocation(
  record: MissionLegRecord,
  iss: () => Promise<IssPosition>,
): Promise<MissionContext["location"]> {
  const position = record.position;
  switch (position.kind) {
    case "simulated":
      return {
        latitude: position.latitude,
        longitude: position.longitude,
        altitudeKm: position.altitudeKm,
        asOf: null,
        source: "simulated",
        label: `Simulated: ${position.description}`,
        sourceUrl: null,
      };
    case "spacecraft_tle": {
      const pos = await getSpacecraftPosition(position.noradId);
      return {
        latitude: round(pos.latitude, 3),
        longitude: round(pos.longitude, 3),
        altitudeKm: round(pos.altitudeKm, 1),
        asOf: pos.epoch,
        source: pos.source,
        label: `${VEHICLE} position computed from its orbital elements (CelesTrak)`,
        sourceUrl: celestrakUrl(position.noradId),
      };
    }
    case "iss": {
      const pos = await iss();
      return {
        latitude: round(pos.latitude, 3),
        longitude: round(pos.longitude, 3),
        altitudeKm: round(pos.altitudeKm, 1),
        asOf: pos.epoch,
        source: pos.source,
        label: ISS_LABELS[pos.source],
        sourceUrl: WHERE_THE_ISS_URL,
      };
    }
  }
}

function buildCabinTemperature(phase: MissionPhase): MissionContext["cabinTemperature"] {
  const config = CABIN_TEMPERATURE[phase];
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

/**
 * Mission context of a session for one phase. `sessionId` selects the
 * mission linked in session_missions; null uses the demo mission.
 */
export async function getMissionContext(
  phase: MissionPhase,
  sessionId: string | null = null,
): Promise<MissionContext> {
  const record = await loadMissionLeg(phase, sessionId);
  if (!record) throw new MissionNotRegisteredError(phase);

  const iss = issLoader();
  const [departureCoordinates, location, destinationCoordinates] = await Promise.all([
    placeCoordinates(record.departure.place, iss),
    buildLocation(record, iss),
    placeCoordinates(record.destination.place, iss),
  ]);
  return {
    phase,
    phaseLabel: PHASE_LABELS[phase],
    status: PHASE_STATUS[phase],
    vehicle: VEHICLE,
    mission: { code: record.mission.code, name: record.mission.name },
    departure: {
      name: record.departure.place.name,
      departedAt: record.departure.departedAt,
      departedAtSource: record.departure.departedAtSource,
      coordinates: departureCoordinates,
    },
    location,
    destination: {
      name: record.destination.place.name,
      description: record.destination.description,
      coordinates: destinationCoordinates,
      distanceKm: round(surfaceDistanceKm(location, destinationCoordinates), 1),
    },
    cabinTemperature: buildCabinTemperature(phase),
    missionReference: record.mission.reference,
  };
}
