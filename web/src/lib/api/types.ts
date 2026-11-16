/**
 * Types mirroring the NestJS backend outputs (snake_case, as returned on the
 * wire) and the Next.js mission-context route (camelCase).
 */

export type CheckIn = {
  id: string;
  check_in_date: string; // YYYY-MM-DD (UTC)
  sleep_hours: number;
  stress_level: number; // 1-5
  mood_level: number; // 1-5
  team_conflict_level: number; // 1-5
  fatigue: number; // 1-7
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type CheckInOption = { value: number; label: string };

export type CheckInOptions = {
  stress_level: CheckInOption[];
  mood_level: CheckInOption[];
  team_conflict_level: CheckInOption[];
  fatigue: CheckInOption[];
};

export type ListCheckIns = {
  items: CheckIn[];
  today: string;
  timezone: "UTC";
};

/** Body of PUT /api/check-ins/:date. */
export type PutCheckInBody = {
  sleep_hours: number; // 0-24, max 2 decimals
  stress_level: number;
  mood_level: number;
  team_conflict_level: number;
  fatigue: number;
  description?: string | null; // max 2000 chars
};

export type CheckInActionStatus = "acknowledged" | "completed" | "dismissed";

export type CheckInAction = {
  id: string;
  check_in_id: string;
  evaluation_key: string;
  action_code: string;
  reason_code: string;
  ruleset_version: string;
  forecast_snapshot: unknown;
  task_key: string;
  title: string;
  source: "forecast" | "check_in" | "system";
  kind: "task" | "review_insight";
  /** Includes backend-managed "suggested" and "superseded". */
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

export type CheckInInsight = {
  id: string;
  check_in_id: string;
  evaluation_key: string;
  title: string;
  summary: string;
  next_step: string;
  facts: unknown;
  source: "ai" | "fallback";
  generator: string | null;
  created_at: string;
  superseded_at: string | null;
};

export type EvaluateActionsResult = {
  status: "ready" | "insufficient_history" | "unavailable";
  forecast: ForecastResult;
  insight: CheckInInsight;
  actions: CheckInAction[];
};

export type ListCheckInActions = { actions: CheckInAction[] };

/** Canonical forecast is returned independently from the generated recommendation. */
export type ForecastResult =
  | {
      status: "ready";
      probability_high_fatigue: number;
      model_version: string;
      predicted_at: string;
    }
  | { status: "insufficient_history" }
  | { status: "unavailable" };

/** Error body of the NestJS ApiError. */
export type BackendErrorBody = {
  statusCode: number;
  /** e.g. CHECK_IN_NOT_LATEST, EVALUATION_OUTDATED, ACTION_NOT_PENDING. */
  code: string;
  message: string;
  details?: { field: string; message: string }[];
};

export type MissionPhase = "in_orbit" | "return_to_earth";

export type PointCoordinates = {
  latitude: number;
  longitude: number;
  asOf: string | null;
  source: "wheretheiss" | "wheretheiss_snapshot" | "ll2" | "mission_registration" | "manual" | "simulated";
  label: string;
  sourceUrl: string | null;
};

/** Response of the Next.js route GET /api/mission-context?phase=... */
export type MissionContext = {
  phase: MissionPhase;
  phaseLabel: string;
  status: string;
  vehicle: string;
  mission: { code: string; name: string; registrySource: "database" | "built_in" };
  departure: {
    name: string;
    departedAt: string | null;
    departedAtSource: string | null;
    coordinates: PointCoordinates;
  };
  location: {
    latitude: number;
    longitude: number;
    altitudeKm: number;
    asOf: string | null;
    source: "wheretheiss" | "wheretheiss_snapshot" | "celestrak_tle" | "simulated";
    label: string;
    sourceUrl: string | null;
  };
  destination: {
    name: string;
    description: string;
    coordinates: PointCoordinates;
    distanceKm: number;
  };
  cabinTemperature: {
    celsius: number | null;
    measuredAt: string | null;
    source: "iss_historical" | "simulated";
    status: "ok" | "pending_sample";
    label: string;
    sourceUrl: string | null;
  };
  missionReference: { label: string; url: string } | null;
};


/** Saved place of GET /api/mission-places (table mission_places). */
export type MissionPlaceOption = { code: string; name: string; label: string; kind: "tracked" | "fixed" };

/** Body of POST /api/missions ("Register a mission"); see lib/mission/mission-registration.ts. */
export type MissionRegistrationInput = {
  name: string;
  code: string;
  noradId: string;
  ll2LaunchId: string;
  referenceLabel: string;
  referenceUrl: string;
  legs: Record<
    MissionPhase,
    {
      departurePlace: string;
      destinationPlace: string;
      /** "YYYY-MM-DD HH:MM" in UTC (an ISO string is accepted too); empty when unknown. */
      departureAt: string;
      departureAtSource: string;
      destinationDescription: string;
    }
  >;
};
