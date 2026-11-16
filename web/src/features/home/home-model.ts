/**
 * Pure helpers for the Home overview (Figma 01 · 30:2): metric cards from the
 * latest check-in and the daily checklist summary. No React here so the logic
 * is covered by `home-model.test.ts`.
 */
import type { CheckIn, CheckInAction } from "../../lib/api/types.ts";
import { FATIGUE_MAX, formatLongDate, formatNumber } from "../history/history-data.ts";
import { planStatus } from "../plan/plan-model.ts";

export type HomeMetric = { value: string; detail: string };

export type HomeMetrics = { sleep: HomeMetric; fatigue: HomeMetric };

const EMPTY = "—";

/** Metric cards. `today` is the backend's UTC day (`ListCheckIns.today`). */
export function homeMetrics(latest: CheckIn | null, today: string | null, failed = false): HomeMetrics {
  if (!latest) {
    const detail = failed ? "Unavailable" : "No check-in yet";
    return { sleep: { value: EMPTY, detail }, fatigue: { value: EMPTY, detail } };
  }
  const when = latest.check_in_date === today ? "Today’s check-in" : `Check-in · ${formatLongDate(latest.check_in_date)}`;
  return {
    sleep: { value: `${formatNumber(latest.sleep_hours)} h`, detail: when },
    fatigue: { value: `${latest.fatigue} / ${FATIGUE_MAX}`, detail: "Self-reported" },
  };
}

export type HomeChecklist = { done: number; total: number; next: string | null };

/** Fallback row while the latest check-in has no persisted actions yet (the Plan screen evaluates it). */
const REVIEW_INSIGHT = "Review your check-in insight";

/**
 * Same rows as the Plan card: "Save today's check-in" plus the persisted
 * actions of the latest check-in (titles come from the backend). Superseded
 * actions belong to an older evaluation and are skipped. A dismissed task is
 * closed: it is neither complete nor the next task.
 */
export function homeChecklist(checkedToday: boolean, actions: readonly CheckInAction[]): HomeChecklist {
  const rows: { task: string; done: boolean; closed: boolean }[] = [
    { task: "Save today’s check-in", done: checkedToday, closed: checkedToday },
  ];
  const current = actions.filter((a) => {
    const status = planStatus(a.status);
    return status !== null && status !== "superseded";
  });
  if (current.length === 0) {
    rows.push({ task: REVIEW_INSIGHT, done: false, closed: false });
  }
  for (const a of current) {
    const status = planStatus(a.status);
    rows.push({
      task: a.title,
      done: status === "completed",
      closed: status === "completed" || status === "dismissed",
    });
  }
  return {
    done: rows.filter((r) => r.done).length,
    total: rows.length,
    next: rows.find((r) => !r.closed)?.task ?? null,
  };
}
