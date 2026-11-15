import type { CheckIn } from "@/lib/api";

/** Fatigue scale used by the check-in (1-7). */
const FATIGUE_MAX = 7;

export type BasicSummary = {
  /** Figma 32:457 body: sleep and fatigue blocks, separated by a blank line. */
  text: string;
  /** Figma footnote: "Comparison with N previous check-ins. This summary uses your recorded values." */
  note: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(round1(n));
const signed = (n: number) => {
  const r = round1(n);
  // Figma uses the typographic minus (−0.2 h).
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : "0";
};
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Basic summary shown when Ceres is unavailable (Figma "15 · Insight · Basic
 * summary fallback"): the latest sleep and fatigue against the average of the
 * previous check-ins, using only recorded values.
 */
export function buildBasicSummary(latest: CheckIn, previous: readonly CheckIn[]): BasicSummary {
  const others = previous.filter((c) => c.id !== latest.id);
  const fatigueToday = `${latest.fatigue}/${FATIGUE_MAX}`;
  if (others.length === 0) {
    return {
      text: `Sleep · ${fmt(latest.sleep_hours)} h today\n\nFatigue · ${fatigueToday} today`,
      note: "This summary uses your recorded values.",
    };
  }
  const sleepAvg = mean(others.map((c) => c.sleep_hours));
  const fatigueAvg = mean(others.map((c) => c.fatigue));
  const text =
    `Sleep · ${fmt(latest.sleep_hours)} h today / ${fmt(sleepAvg)} h previous average\n` +
    `Difference · ${signed(latest.sleep_hours - sleepAvg)} h\n\n` +
    `Fatigue · ${fatigueToday} today / ${fmt(fatigueAvg)}/${FATIGUE_MAX} previous average\n` +
    `Difference · ${signed(latest.fatigue - fatigueAvg)} points`;
  const n = others.length;
  return {
    text,
    note: `Comparison with ${n} previous check-in${n === 1 ? "" : "s"}. This summary uses your recorded values.`,
  };
}
