import type { CheckInOptions } from "@/lib/api";
import type { IconName } from "@/components/ui/Icon";

export type ScaleId = "stress" | "mood" | "team" | "fatigue";

export type ScaleOptionDef = {
  value: number;
  /** Label from Figma (`input/<scale>/<n> · <label>`); verified against the backend seed. */
  label: string;
  icon: IconName;
  selectedIcon: IconName;
};

export type ScaleDef = {
  id: ScaleId;
  title: string;
  /** Key in the backend options / PUT body. */
  apiKey: keyof CheckInOptions;
  headingIcon: IconName;
  /** Review card icon (22px). */
  reviewIcon: IconName;
  /** Figma shows the 1 / N direction legend on every scale except fatigue. */
  legend: boolean;
  options: readonly ScaleOptionDef[];
};

const o = (value: number, label: string, face: string): ScaleOptionDef => ({
  value,
  label,
  icon: face as IconName,
  selectedIcon: `${face}-selected` as IconName,
});

export const SCALES: Record<ScaleId, ScaleDef> = {
  stress: {
    id: "stress",
    title: "Stress",
    apiKey: "stress_level",
    headingIcon: "activity-32",
    reviewIcon: "activity-22",
    legend: true,
    options: [
      o(1, "Very calm", "laugh"),
      o(2, "Calm", "smile"),
      o(3, "Moderate", "meh"),
      o(4, "Stressed", "frown"),
      o(5, "Very stressed", "angry"),
    ],
  },
  mood: {
    id: "mood",
    title: "Mood",
    apiKey: "mood_level",
    headingIcon: "sparkles-32",
    reviewIcon: "sparkles-22",
    legend: true,
    options: [
      o(1, "Very happy / positive", "laugh"),
      o(2, "Positive", "smile"),
      o(3, "Neutral", "meh"),
      o(4, "Negative", "frown"),
      o(5, "Very sad / negative", "angry"),
    ],
  },
  team: {
    id: "team",
    title: "Team conflict",
    apiKey: "team_conflict_level",
    headingIcon: "orbit-32",
    reviewIcon: "orbit-22",
    legend: true,
    options: [
      o(1, "No team conflict", "laugh"),
      o(2, "Low team conflict", "smile"),
      o(3, "Moderate team conflict", "meh"),
      o(4, "High team conflict", "frown"),
      o(5, "Very high team conflict", "angry"),
    ],
  },
  fatigue: {
    id: "fatigue",
    title: "Fatigue",
    apiKey: "fatigue",
    headingIcon: "moon-32",
    reviewIcon: "moon-22",
    legend: false,
    options: [
      o(1, "Fully alert and wide awake", "laugh"),
      o(2, "Very active and responsive, but not at peak alertness", "smile-plus"),
      o(3, "Feeling well and ready", "smile"),
      o(4, "A little tired and less energetic", "meh"),
      o(5, "Moderately tired and fatigued", "frown"),
      o(6, "Extremely tired, with great difficulty concentrating", "annoyed"),
      o(7, "Completely exhausted and unable to function effectively", "angry"),
    ],
  },
};

export const SCALE_MAX: Record<ScaleId, number> = { stress: 5, mood: 5, team: 5, fatigue: 7 };

export const STEP_LABELS = ["Stress", "Mood", "Team", "Fatigue", "Description", "Review"] as const;

export type StepId = "stress" | "mood" | "team" | "fatigue" | "description" | "review";

export const STEP_ORDER: readonly StepId[] = ["stress", "mood", "team", "fatigue", "description", "review"];

export const stepPath = (step: StepId) => `/check-in/${step}`;

/** Sleep presets (Figma chips). */
export const SLEEP_PRESETS = [6, 6.5, 7, 8] as const;

export const formatHours = (hours: number) => `${hours} h`;

/** Merge backend labels over the Figma ones; returns the label differences found. */
export function mergeBackendLabels(
  backend: CheckInOptions,
): { scales: Record<ScaleId, ScaleDef>; divergences: string[] } {
  const divergences: string[] = [];
  const scales = { ...SCALES };
  for (const id of Object.keys(SCALES) as ScaleId[]) {
    const def = SCALES[id];
    const remote = backend[def.apiKey];
    if (!Array.isArray(remote) || remote.length !== def.options.length) {
      if (Array.isArray(remote) && remote.length > 0) {
        divergences.push(`${def.apiKey}: expected ${def.options.length} options, backend sent ${remote.length}`);
      }
      continue;
    }
    scales[id] = {
      ...def,
      options: def.options.map((opt) => {
        const match = remote.find((r) => r.value === opt.value);
        if (!match) return opt;
        if (match.label !== opt.label) {
          divergences.push(`${def.apiKey}[${opt.value}]: Figma "${opt.label}" vs backend "${match.label}"`);
        }
        return { ...opt, label: match.label };
      }),
    };
  }
  return { scales, divergences };
}

export const SAVED_PATH = "/check-in/saved";
