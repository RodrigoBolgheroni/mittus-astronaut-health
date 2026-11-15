import type { CheckIn, CheckInAction, CheckInActionStatus } from "@/lib/api/types.ts";

/** Statuses the backend can return for an action (`pending` is not one of them). */
export type PlanStatus = "suggested" | "acknowledged" | "completed" | "dismissed" | "superseded";

const KNOWN: readonly string[] = ["suggested", "acknowledged", "completed", "dismissed", "superseded"];

export function planStatus(status: string): PlanStatus | null {
  return KNOWN.includes(status) ? (status as PlanStatus) : null;
}

// Figma 10-13 (checklist row status) and 16 (history tag: "Replaced" = superseded).
export const ROW_STATUS: Record<PlanStatus, string> = {
  suggested: "Suggested",
  acknowledged: "Seen",
  completed: "Completed",
  dismissed: "Dismissed",
  superseded: "Replaced",
};

// Figma page subtitles per frame (30:371, 32:291, 32:334, 32:375).
export const SUBTITLE: Record<Exclude<PlanStatus, "superseded">, string> = {
  suggested: "A suggested task is ready for you to review.",
  acknowledged: "Mark the task complete when you finish.",
  completed: "Your suggested task for this check-in is complete.",
  dismissed: "The dismissed task appears in your action history.",
};

// PENDING copy: these states are not designed in Figma.
export const COPY = {
  loadingSubtitle: "Checking your latest check-in.",
  emptySubtitle: "Save a check-in to see a suggested task.",
  emptyBody: "No suggested task yet. Your plan appears after you save a check-in.",
  errorSubtitle: "The plan could not be loaded.",
  errorBody: "We could not load your plan. Your check-ins are not affected.",
  noActionSubtitle: "No task is suggested right now.",
  updateFailed: "The task could not be updated. Try again.",
  historyEmpty: "No tasks yet.",
  historyError: "We could not load your action history.",
} as const;

/** Short message after a 409, by backend code. PENDING copy (not in Figma). */
export function conflictMessage(code: string | undefined): string {
  switch (code) {
    case "ACTION_NOT_PENDING":
      return "This task was already closed. Showing the current task.";
    case "CHECK_IN_NOT_LATEST":
      return "A newer check-in exists. Showing its task.";
    case "EVALUATION_OUTDATED":
      return "Your check-ins changed. Showing the current task.";
    default:
      return "The task changed. Showing the current task.";
  }
}

/** Plan-card task name. "Keep tracking..." is Figma (monitor); recheck is inferred from the history label (PENDING). */
export function taskTitle(actionCode: string): string {
  if (actionCode === "monitor") return "Keep tracking your daily check-ins";
  if (actionCode === "recheck") return "Record a new check-in";
  return "Suggested task";
}

/** History-log title (Figma 32:498 labels, mapped by action code: PENDING inference). */
export function historyTitle(actionCode: string): string {
  if (actionCode === "monitor") return "Track daily check-ins";
  if (actionCode === "recheck") return "Record a new check-in";
  return "Suggested task";
}

/** Newest first (the API order). The vigent action is the newest one unless it was replaced. */
export function currentAction(actions: readonly CheckInAction[]): CheckInAction | null {
  const first = actions[0];
  return first && first.status !== "superseded" ? first : null;
}

export function latestCheckIn(items: readonly CheckIn[]): CheckIn | null {
  return items.reduce<CheckIn | null>((a, c) => (!a || c.check_in_date > a.check_in_date ? c : a), null);
}

/** Buttons per state, in Figma order (30:371 and 32:291). */
export const CONTROLS: Record<"suggested" | "acknowledged", { label: string; status: CheckInActionStatus; variant: "primary" | "secondary" | "quiet" }[]> = {
  suggested: [
    { label: "Got it", status: "acknowledged", variant: "primary" },
    { label: "Mark complete", status: "completed", variant: "secondary" },
    { label: "Dismiss", status: "dismissed", variant: "quiet" },
  ],
  acknowledged: [
    { label: "Mark complete", status: "completed", variant: "primary" },
    { label: "Dismiss", status: "dismissed", variant: "quiet" },
  ],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Nov 2026 · 14:35" in UTC (Figma 32:498). */
export function formatLogDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** The moment shown in the log: last change of the action. */
export function eventAt(action: CheckInAction): string {
  return action.resolved_at ?? action.acknowledged_at ?? action.created_at;
}
