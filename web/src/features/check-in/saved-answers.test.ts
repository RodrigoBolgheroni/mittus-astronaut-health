import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CheckIn } from "../../lib/api/types.ts";
import { answersFromCheckIn, todaysCheckIn } from "./saved-answers.ts";

const checkIn = (over: Partial<CheckIn> = {}): CheckIn => ({
  id: "c1",
  check_in_date: "2026-11-15",
  sleep_hours: 7.25,
  stress_level: 4,
  mood_level: 2,
  team_conflict_level: 3,
  fatigue: 6,
  description: "Long EVA",
  created_at: "2026-11-15T10:00:00.000Z",
  updated_at: "2026-11-15T10:00:00.000Z",
  ...over,
});

describe("saved answers", () => {
  it("maps a saved check-in back to the flow answers", () => {
    assert.deepEqual(answersFromCheckIn(checkIn()), {
      stress: 4,
      mood: 2,
      team: 3,
      fatigue: 6,
      sleepHours: 7.25,
      description: "Long EVA",
    });
    assert.equal(answersFromCheckIn(checkIn({ description: null })).description, "");
  });
  it("only reuses the check-in of the backend's today", () => {
    const today = checkIn();
    assert.equal(todaysCheckIn({ items: [today], today: "2026-11-15", timezone: "UTC" }), today);
    assert.equal(todaysCheckIn({ items: [checkIn({ check_in_date: "2026-11-14" })], today: "2026-11-15", timezone: "UTC" }), null);
    assert.equal(todaysCheckIn({ items: [], today: "2026-11-15", timezone: "UTC" }), null);
  });
});
