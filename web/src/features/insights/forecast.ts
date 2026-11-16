import type { CeresForecast, CheckIn, CheckInAction } from "../../lib/api/types.ts";

export type ForecastState =
  | { kind: "loading" }
  | { kind: "ready"; percent: number; forecast: CeresForecast | null }
  | { kind: "insufficient_history" }
  | { kind: "unavailable" };

/** Latest check-in by date (the backend only evaluates the latest one). */
export function latestCheckIn(items: CheckIn[]): CheckIn | null {
  return items.reduce<CheckIn | null>(
    (best, item) => (best === null || item.check_in_date > best.check_in_date ? item : best),
    null,
  );
}

/** Reads `probability_high_fatigue` (0-1) from `CheckInAction.forecast_snapshot`. */
export function probabilityFromSnapshot(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const p = (snapshot as { probability_high_fatigue?: unknown }).probability_high_fatigue;
  return typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1 ? p : null;
}

export function percentFromAction(action: CheckInAction | null): number | null {
  const p = action ? probabilityFromSnapshot(action.forecast_snapshot) : null;
  return p === null ? null : Math.round(p * 100);
}

/** Rebuilds the Ceres `ready` forecast from the action snapshot; null if a field is missing. */
export function ceresForecastFromAction(action: CheckInAction | null): CeresForecast | null {
  const snap = action?.forecast_snapshot;
  if (!snap || typeof snap !== "object") return null;
  const { model_version, predicted_at } = snap as { model_version?: unknown; predicted_at?: unknown };
  const p = probabilityFromSnapshot(snap);
  if (p === null || typeof model_version !== "string" || !model_version || typeof predicted_at !== "string" || !predicted_at) {
    return null;
  }
  return { status: "ready", probability_high_fatigue: p, model_version, predicted_at };
}
