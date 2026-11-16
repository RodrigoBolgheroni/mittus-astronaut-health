/**
 * Fetch client for the Mittus backend.
 *
 * - Backend calls use `NEXT_PUBLIC_API_URL` (default http://localhost:3001) +
 *   `/api`, with `credentials: 'include'` for the signed session cookie.
 * - `getMissionContext` is served by the Next.js app itself (same-origin
 *   `/api/mission-context`), not by the NestJS backend.
 * - 409 responses (CHECK_IN_NOT_LATEST, EVALUATION_OUTDATED, ACTION_NOT_PENDING)
 *   throw `ApiError` with `status === 409` and the parsed body
 *   ({statusCode, code, message}). The body does NOT carry the current action;
 *   call `listCheckInActions` to read it.
 */
import type {
  BackendErrorBody,
  CheckIn,
  CheckInActionStatus,
  CheckInAction,
  CheckInOptions,
  EvaluateActionsResult,
  ListCheckInActions,
  ListCheckIns,
  MissionContext,
  MissionPhase,
  MissionPlaceOption,
  MissionRegistrationInput,
  PutCheckInBody,
} from "./types.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  /** Backend error code (e.g. "EVALUATION_OUTDATED") when the body has one. */
  get code(): string | undefined {
    const b = this.body as Partial<BackendErrorBody> | null;
    return b && typeof b === "object" && typeof b.code === "string" ? b.code : undefined;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Absolute-path on the Next.js origin instead of the backend. */
  sameOrigin?: boolean;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = options.sameOrigin ? path : `${apiBaseUrl()}/api${path}`;
  const hasBody = options.body !== undefined;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: hasBody ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    ...(options.sameOrigin ? { cache: "no-store" as const } : {}),
  });
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : undefined;
    throw new ApiError(response.status, parsed, message);
  }
  return parsed as T;
}

const enc = encodeURIComponent;

/** PUT /api/check-ins/:date (date = YYYY-MM-DD, UTC). */
export function putCheckIn(date: string, body: PutCheckInBody): Promise<CheckIn> {
  return request<CheckIn>(`/check-ins/${enc(date)}`, { method: "PUT", body });
}

/** GET /api/check-ins?limit= (backend max 90). */
export function listCheckIns(limit?: number): Promise<ListCheckIns> {
  const qs = limit === undefined ? "" : `?limit=${enc(String(limit))}`;
  return request<ListCheckIns>(`/check-ins${qs}`);
}

/** GET /api/check-ins/:date. Rejects with ApiError(404) when absent. */
export function getCheckIn(date: string): Promise<CheckIn> {
  return request<CheckIn>(`/check-ins/${enc(date)}`);
}

/** GET /api/check-in-options. */
export function getCheckInOptions(): Promise<CheckInOptions> {
  return request<CheckInOptions>("/check-in-options");
}

/** POST /api/check-ins/:id/actions/evaluate (empty body; 409 if not latest/outdated). */
export function evaluateCheckInActions(checkInId: string): Promise<EvaluateActionsResult> {
  return request<EvaluateActionsResult>(`/check-ins/${enc(checkInId)}/actions/evaluate`, { method: "POST" });
}

/** GET /api/check-ins/:id/actions. */
export function listCheckInActions(checkInId: string): Promise<ListCheckInActions> {
  return request<ListCheckInActions>(`/check-ins/${enc(checkInId)}/actions`);
}

/** PATCH /api/check-in-actions/:id (409 ACTION_NOT_PENDING if already closed). */
export function updateCheckInAction(actionId: string, status: CheckInActionStatus): Promise<CheckInAction> {
  return request<CheckInAction>(`/check-in-actions/${enc(actionId)}`, { method: "PATCH", body: { status } });
}

/** GET /api/mission-context?phase= on the Next.js origin (same-origin). */
export function getMissionContext(phase: MissionPhase): Promise<MissionContext> {
  return request<MissionContext>(`/api/mission-context?phase=${enc(phase)}`, { sameOrigin: true });
}


/** GET /api/mission-places on the Next.js origin: saved places for "Register a mission". */
export function listMissionPlaces(): Promise<{ places: MissionPlaceOption[] }> {
  return request<{ places: MissionPlaceOption[] }>("/api/mission-places", { sameOrigin: true });
}

/**
 * POST /api/missions on the Next.js origin. Rejects with ApiError: 400 with
 * `fields` for invalid input, 409 `code_taken` / `session_required`, 503 when
 * the mission registry is unavailable.
 */
export function registerMission(body: MissionRegistrationInput): Promise<{ code: string }> {
  return request<{ code: string }>("/api/missions", { method: "POST", sameOrigin: true, body });
}
