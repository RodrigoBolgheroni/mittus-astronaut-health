import type { CeresRecommendation, CeresTask, CheckIn } from "../api/types.ts";

/**
 * Per-tab cache of the last Ceres recommendation. Ceres takes 6-45 s and calls a
 * paid model, so the same evaluation is not requested twice; the Plan screen
 * reads the AI task titles from here until the backend persists them.
 */
const STORAGE_KEY = "mittus.ceres.recommendation";

type Entry = { key: string; checkInId: string; recommendation: CeresRecommendation };

/** Changes when the check-in values or the forecast used by Ceres change. */
export function evaluationKey(checkIn: CheckIn, probability: number | null): string {
  return [
    checkIn.id,
    checkIn.updated_at,
    probability === null ? "none" : probability.toFixed(4),
  ].join("|");
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveRecommendation(key: string, checkInId: string, recommendation: CeresRecommendation, store = storage()) {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify({ key, checkInId, recommendation } satisfies Entry));
  } catch {
    /* storage full or blocked: the recommendation is simply not cached */
  }
}

function read(store: Storage | null): Entry | null {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<Entry>;
    if (typeof entry.key !== "string" || typeof entry.checkInId !== "string" || !entry.recommendation) return null;
    return entry as Entry;
  } catch {
    return null;
  }
}

export function loadRecommendation(key: string, store = storage()): CeresRecommendation | null {
  const entry = read(store);
  return entry && entry.key === key ? entry.recommendation : null;
}

/** Title of the AI task that matches a persisted action, for the latest check-in only. */
export function taskTitleFor(checkInId: string, actionCode: string, store = storage()): string | null {
  const entry = read(store);
  if (!entry || entry.checkInId !== checkInId) return null;
  const matches = entry.recommendation.tasks.filter((t: CeresTask) => t.action_code === actionCode && t.title);
  const task = matches.find((t) => t.source === "forecast") ?? matches[0];
  return task?.title ?? null;
}
