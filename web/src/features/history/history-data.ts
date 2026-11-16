/**
 * Pure helpers for the History screens (Figma 30:132 sleep, 36:502 fatigue).
 * No React here so the logic is covered by `history-data.test.ts`.
 */
import type { CheckIn } from "../../lib/api/types.ts";

export type HistoryMetric = "sleep" | "fatigue";

/** `/history?metric=fatigue` -> fatigue; anything else -> sleep (the default tab). */
export function parseMetric(raw: string | string[] | null | undefined): HistoryMetric {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "fatigue" ? "fatigue" : "sleep";
}

/** Number of check-ins the screen asks for (`GET /api/check-ins?limit=7`). */
export const HISTORY_LIMIT = 7;

/** Rows in the "Recent check-ins" card (Figma shows three, newest first). */
export const RECENT_ROWS = 3;

/**
 * Full bar height in px. Figma: sleep 8 h x 13 px = 104; fatigue 10 x 10.4 = 104.
 * The bar column is 172 tall (value label + 4 + bar + 4 + date).
 */
export const BAR_MAX_PX = 104;

/** Figma sleep scale is 0-8 h; widened (whole hours) when a value is above it. */
export const SLEEP_SCALE_MIN_MAX = 8;

/**
 * Backend fatigue scale is 1-7 (check_ins.fatigue CHECK 1..7). Figma draws the
 * fatigue chart and table on 0-10 (PENDING P9): no conversion is made, values
 * are shown as returned by the backend, on its own 1-7 scale.
 */
export const FATIGUE_MAX = 7;

/** Mood scale in the backend (1-5). */
export const MOOD_MAX = 5;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function parts(date: string): { day: number; month: string; year: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { day: d, month: MONTHS[m - 1] ?? "", year: y };
}

/** "2026-11-08" -> "8 Nov" (chart axis, Figma). Dates are UTC calendar days. */
export function formatShortDate(date: string): string {
  const p = parts(date);
  return `${p.day} ${p.month}`;
}

/** "2026-11-14" -> "14 Nov 2026" (table, Figma). */
export function formatLongDate(date: string): string {
  const p = parts(date);
  return `${p.day} ${p.month} ${p.year}`;
}

/** Figma range style "8–14 Nov 2026" (en dash), widened when months/years differ. */
export function formatRange(first: string, last: string): string {
  if (first === last) return formatLongDate(first);
  const a = parts(first);
  const b = parts(last);
  if (a.year !== b.year) return `${formatLongDate(first)}–${formatLongDate(last)}`;
  if (a.month !== b.month) return `${a.day} ${a.month}–${b.day} ${b.month} ${b.year}`;
  return `${a.day}–${b.day} ${b.month} ${b.year}`;
}

/** 7 -> "7", 6.5 -> "6.5" (Figma value labels; the backend keeps up to two decimals). */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Oldest first (left to right on the chart). The backend returns newest first. */
export function chronological(items: readonly CheckIn[]): CheckIn[] {
  return [...items].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
}

/** Newest first (table order). */
export function newestFirst(items: readonly CheckIn[]): CheckIn[] {
  return chronological(items).reverse();
}

const COUNT_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven"] as const;

/**
 * Figma subtitle "Seven daily check-ins · 8–14 Nov 2026 · simulated data",
 * filled with the real count and date range.
 */
export function historySubtitle(items: readonly CheckIn[]): string {
  const sorted = chronological(items);
  if (sorted.length === 0) return HISTORY_COPY.subtitleFallback;
  const n = sorted.length;
  const count = COUNT_WORDS[n] ?? String(n);
  const noun = n === 1 ? "daily check-in" : "daily check-ins";
  const range = formatRange(sorted[0].check_in_date, sorted[n - 1].check_in_date);
  return `${count} ${noun} · ${range} · simulated data`;
}

export function sleepScaleMax(items: readonly CheckIn[]): number {
  const max = items.reduce((m, item) => Math.max(m, item.sleep_hours), 0);
  return Math.max(SLEEP_SCALE_MIN_MAX, Math.ceil(max));
}

export function barHeight(value: number, scaleMax: number): number {
  if (!(scaleMax > 0) || !(value > 0)) return 0;
  return Math.min(BAR_MAX_PX, (value / scaleMax) * BAR_MAX_PX);
}

export type ChartPoint = {
  date: string;
  /** "8 Nov" */
  axisLabel: string;
  /** "14 Nov 2026" (accessible table). */
  longDate: string;
  value: number;
  /** "7.2" / "3" */
  valueLabel: string;
  heightPx: number;
  /** Newest entry: cyan bar in Figma. */
  latest: boolean;
};

export type ChartModel = {
  metric: HistoryMetric;
  scaleMax: number;
  points: ChartPoint[];
};

export function chartModel(items: readonly CheckIn[], metric: HistoryMetric): ChartModel {
  const sorted = chronological(items);
  const scaleMax = metric === "sleep" ? sleepScaleMax(sorted) : FATIGUE_MAX;
  const points = sorted.map((item, index) => {
    const value = metric === "sleep" ? item.sleep_hours : item.fatigue;
    return {
      date: item.check_in_date,
      axisLabel: formatShortDate(item.check_in_date),
      longDate: formatLongDate(item.check_in_date),
      value,
      valueLabel: formatNumber(value),
      heightPx: barHeight(value, scaleMax),
      latest: index === sorted.length - 1,
    };
  });
  return { metric, scaleMax, points };
}

/** Figma "Hours of sleep · scale 0–8 h" / "Self-reported fatigue · scale 0–10" (P9). */
export function chartCaption(model: ChartModel): string {
  return model.metric === "sleep"
    ? `Hours of sleep · scale 0–${model.scaleMax} h`
    : `Self-reported fatigue · scale 1–${FATIGUE_MAX}`;
}

export type RecentRow = { id: string; date: string; sleep: string; fatigue: string; mood: string };

/**
 * Rows for "Recent check-ins". Mood uses the backend option label when known
 * (Figma "Okay"/"Low" have no mapping in the backend: PENDING P9); otherwise "n / 5".
 */
export function recentRows(
  items: readonly CheckIn[],
  moodLabels: ReadonlyMap<number, string> | null,
  limit = RECENT_ROWS,
): RecentRow[] {
  return newestFirst(items)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      date: formatLongDate(item.check_in_date),
      sleep: `${formatNumber(item.sleep_hours)} h`,
      fatigue: `${item.fatigue} / ${FATIGUE_MAX}`,
      mood: moodLabels?.get(item.mood_level) ?? `${item.mood_level} / ${MOOD_MAX}`,
    }));
}

/** Copy. Literal Figma text unless marked PENDING (no Figma frame for the state). */
export const HISTORY_COPY = {
  sleepTitle: "Sleep history",
  fatigueTitle: "Fatigue history",
  // PENDING (copy): no Figma subtitle for loading / error / empty.
  subtitleFallback: "Daily check-ins · simulated data",
  sleepHeading: "Sleep duration",
  fatigueHeading: "Perceived fatigue",
  toFatigue: "View fatigue →",
  toSleep: "← View sleep",
  recentHeading: "Recent check-ins",
  columns: { date: "DATE", sleep: "SLEEP", fatigue: "FATIGUE", mood: "MOOD" },
  // PENDING (copy): History has no loading / error / empty frames in Figma.
  loading: "Loading check-ins…",
  error: "Check-ins could not be loaded.",
  retry: "Try again", // Figma literal (Save error 32:550).
  empty: "No check-ins yet.",
  emptyAction: "Daily check-in", // Figma literal (Home 30:2).
} as const;
