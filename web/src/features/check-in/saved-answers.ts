import type { CheckIn, ListCheckIns } from "../../lib/api/types.ts";

/** Same shape as `Answers` in CheckInProvider (kept here so it is testable without React). */
export type SavedAnswers = {
  stress: number;
  mood: number;
  team: number;
  fatigue: number;
  sleepHours: number;
  description: string;
};

/** Today's (backend UTC day) saved check-in, or null when it was not saved yet. */
export function todaysCheckIn(list: ListCheckIns): CheckIn | null {
  return list.items.find((c) => c.check_in_date === list.today) ?? null;
}

/** Answers that reproduce a saved check-in, so reopening the flow edits it. */
export function answersFromCheckIn(c: CheckIn): SavedAnswers {
  return {
    stress: c.stress_level,
    mood: c.mood_level,
    team: c.team_conflict_level,
    fatigue: c.fatigue,
    sleepHours: c.sleep_hours,
    description: c.description ?? "",
  };
}
