import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluationKey, loadRecommendation, saveRecommendation, taskTitleFor } from "./recommendation-cache.ts";

function memoryStore(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as unknown as Storage;
}

const task = (source: "check_in" | "forecast", action_code: string, title: string) =>
  ({ task_key: source, title, source, kind: "task", action_code, reason_code: "r", ruleset_version: "v", status: "suggested", forecast_snapshot: null }) as const;

const rec = {
  insight: { title: "t", summary: "s", next_step: "n", facts: {}, source: "ai", generator: null },
  tasks: [task("check_in", "monitor", "Check-in task"), task("forecast", "monitor", "Keep tracking your fatigue")],
} as never;

describe("recommendation cache", () => {
  it("returns the recommendation only for the same evaluation key", () => {
    const store = memoryStore();
    saveRecommendation("k1", "c1", rec, store);
    assert.ok(loadRecommendation("k1", store));
    assert.equal(loadRecommendation("k2", store), null);
  });

  it("finds the title by action code, preferring the forecast task, for the same check-in", () => {
    const store = memoryStore();
    saveRecommendation("k1", "c1", rec, store);
    assert.equal(taskTitleFor("c1", "monitor", store), "Keep tracking your fatigue");
    assert.equal(taskTitleFor("c1", "recheck", store), null);
    assert.equal(taskTitleFor("other", "monitor", store), null);
  });

  it("builds a key that changes with the data", () => {
    const c = { id: "c1", updated_at: "a" } as never;
    assert.notEqual(evaluationKey(c, 0.38), evaluationKey(c, 0.4));
    assert.notEqual(evaluationKey(c, 0.38), evaluationKey({ id: "c1", updated_at: "b" } as never, 0.38));
  });

  it("ignores a broken or missing store", () => {
    assert.equal(loadRecommendation("k", null), null);
    assert.doesNotThrow(() => saveRecommendation("k", "c", rec, null));
  });
});
