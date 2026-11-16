/**
 * Pure helpers for the Home overview (Figma 01 · 30:2): metric cards from the
 * latest check-in and the daily checklist summary. No React here so the logic
 * is covered by `home-model.test.ts`.
 */
import type { CheckIn, CheckInAction } from "../../lib/api/types.ts";
import { FATIGUE_MAX, formatLongDate, formatNumber } from "../history/history-data.ts";
import { planStatus, taskTitle } from "../plan/plan-model.ts";

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

/**
 * Same rows as the Plan card: "Save today's check-in", "Review the check-in
 * insight" (not tracked, so it stays open) and the current suggested task, if
 * any. A dismissed task is closed: it is neither complete nor the next task.
 */
export function homeChecklist(checkedToday: boolean, action: CheckInAction | null, actionTitle?: string | null): HomeChecklist {
  const status = action ? planStatus(action.status) : null;
  const rows: { task: string; done: boolean; closed: boolean }[] = [
    { task: "Save today’s check-in", done: checkedToday, closed: checkedToday },
    { task: "Review your check-in insight", done: false, closed: false },
  ];
  if (action && status && status !== "superseded") {
    rows.push({
      task: actionTitle || action.title || taskTitle(action.action_code),
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
