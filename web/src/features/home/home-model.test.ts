import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CheckIn, CheckInAction } from "../../lib/api/types.ts";
import { homeChecklist, homeMetrics } from "./home-model.ts";

const checkIn = (over: Partial<CheckIn> = {}): CheckIn => ({
  id: "c1",
  check_in_date: "2026-11-15",
  sleep_hours: 6.5,
  stress_level: 3,
  mood_level: 3,
  team_conflict_level: 1,
  fatigue: 4,
  description: null,
  created_at: "2026-11-15T10:00:00.000Z",
  updated_at: "2026-11-15T10:00:00.000Z",
  ...over,
});

const action = (id: string, status: string, title: string, over: Partial<CheckInAction> = {}): CheckInAction => ({
  id,
  check_in_id: "c1",
  evaluation_key: "k",
  action_code: "monitor",
  reason_code: "r",
  ruleset_version: "v",
  forecast_snapshot: null,
  task_key: id,
  title,
  source: "check_in",
  kind: "task",
  status,
  created_at: "2026-11-15T10:00:00.000Z",
  acknowledged_at: null,
  resolved_at: null,
  ...over,
});

describe("homeMetrics", () => {
  it("shows the latest check-in with fatigue on the 1-7 scale", () => {
    const m = homeMetrics(checkIn(), "2026-11-15");
    assert.deepEqual(m.sleep, { value: "6.5 h", detail: "Today’s check-in" });
    assert.deepEqual(m.fatigue, { value: "4 / 7", detail: "Self-reported" });
  });
  it("names the date when the latest check-in is not today's", () => {
    assert.equal(homeMetrics(checkIn({ check_in_date: "2026-11-13" }), "2026-11-15").sleep.detail, "Check-in · 13 Nov 2026");
  });
  it("shows placeholders without data", () => {
    assert.deepEqual(homeMetrics(null, "2026-11-15").fatigue, { value: "—", detail: "No check-in yet" });
    assert.equal(homeMetrics(null, null, true).sleep.detail, "Unavailable");
  });
});

describe("homeChecklist", () => {
  it("starts with the check-in as next task", () => {
    assert.deepEqual(homeChecklist(false, []), { done: 0, total: 2, next: "Save today’s check-in" });
  });
  it("lists the persisted actions with their backend titles", () => {
    const actions = [
      action("a1", "completed", "Review your check-in insight", { kind: "review_insight", source: "system" }),
      action("a2", "suggested", "Record your sleep and fatigue again"),
    ];
    assert.deepEqual(homeChecklist(true, actions), { done: 2, total: 3, next: "Record your sleep and fatigue again" });
  });
  it("skips superseded actions and does not count dismissed ones as complete", () => {
    assert.deepEqual(homeChecklist(true, [action("old", "superseded", "Old task")]), {
      done: 1,
      total: 2,
      next: "Review your check-in insight",
    });
    assert.deepEqual(homeChecklist(true, [action("a", "dismissed", "Task")]), { done: 1, total: 2, next: null });
  });
});
