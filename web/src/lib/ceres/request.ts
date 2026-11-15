import type { CeresForecast } from "../api/types.ts";

/**
 * Builds the body of Ceres `POST /v1/recommendations`.
 *
 * Ceres rejects unknown fields (422), and the astronaut's free-text
 * `description` and the session id must never reach the language model, so
 * only the seven contract fields are copied. Returns null when the history is
 * unusable (empty, or a value the contract would reject).
 */
export type CeresCheckIn = {
  id: string;
  check_in_date: string;
  sleep_hours: number;
  stress_level: number;
  mood_level: number;
  team_conflict_level: number;
  fatigue: number;
};

export type CeresRequest = { check_ins: CeresCheckIn[]; forecast?: CeresForecast };

const MAX_CHECK_INS = 90;

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function pick(raw: unknown): CeresCheckIn | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const { id, check_in_date: date, sleep_hours: sleep } = r;
  if (typeof id !== "string" || !id) return null;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof sleep !== "number" || !Number.isFinite(sleep) || sleep < 0 || sleep > 24) return null;
  if (!isInt(r.stress_level, 1, 5) || !isInt(r.mood_level, 1, 5) || !isInt(r.team_conflict_level, 1, 5)) return null;
  if (!isInt(r.fatigue, 1, 7)) return null;
  return {
    id,
    check_in_date: date,
    sleep_hours: sleep,
    stress_level: r.stress_level,
    mood_level: r.mood_level,
    team_conflict_level: r.team_conflict_level,
    fatigue: r.fatigue,
  };
}

export function sanitizeForecast(raw: unknown): CeresForecast | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const f = raw as Record<string, unknown>;
  if (f.status === "insufficient_history" || f.status === "unavailable") return { status: f.status };
  if (
    f.status === "ready" &&
    typeof f.probability_high_fatigue === "number" &&
    f.probability_high_fatigue >= 0 &&
    f.probability_high_fatigue <= 1 &&
    typeof f.model_version === "string" &&
    f.model_version &&
    typeof f.predicted_at === "string" &&
    f.predicted_at
  ) {
    return {
      status: "ready",
      probability_high_fatigue: f.probability_high_fatigue,
      model_version: f.model_version,
      predicted_at: f.predicted_at,
    };
  }
  return undefined;
}

/** `checkIns` in any order; the result is oldest first, one per date, capped at 90. */
export function buildCeresRequest(checkIns: unknown, forecast?: unknown): CeresRequest | null {
  if (!Array.isArray(checkIns)) return null;
  const picked: CeresCheckIn[] = [];
  for (const raw of checkIns) {
    const item = pick(raw);
    if (!item) return null;
    picked.push(item);
  }
  picked.sort((a, b) => (a.check_in_date < b.check_in_date ? -1 : a.check_in_date > b.check_in_date ? 1 : 0));
  const unique = picked.filter((c, i) => i === 0 || c.check_in_date !== picked[i - 1].check_in_date);
  if (unique.length === 0) return null;
  const body: CeresRequest = { check_ins: unique.slice(-MAX_CHECK_INS) };
  const f = sanitizeForecast(forecast);
  if (f) body.forecast = f;
  return body;
}
