import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { predictFatigue } from "@mittus/fatigue-model";

describe("shared fatigue predictor", () => {
  it("requires at least three observations", () => {
    for (const length of [0, 1, 2]) {
      assert.deepEqual(predictFatigue(Array.from({ length }, () => ({ sleep_hours: 8, fatigue: 2 }))), {
        status: "insufficient_history",
      });
    }
  });

  it("assigns greater risk to sustained high fatigue and poor sleep", () => {
    const rested = predictFatigue(Array.from({ length: 3 }, () => ({ sleep_hours: 9, fatigue: 1 })));
    const exhausted = predictFatigue(Array.from({ length: 3 }, () => ({ sleep_hours: 0, fatigue: 7 })));
    assert.equal(rested.status, "ok");
    assert.equal(exhausted.status, "ok");
    if (rested.status !== "ok" || exhausted.status !== "ok") throw new Error("Expected sufficient history.");
    assert.ok(exhausted.probability_high_fatigue > rested.probability_high_fatigue);
    assert.ok(rested.probability_high_fatigue >= 0 && exhausted.probability_high_fatigue <= 1);
  });

  it("rejects observations outside the actual check-in scales", () => {
    const valid = [{ sleep_hours: 8, fatigue: 2 }, { sleep_hours: 8, fatigue: 2 }];
    for (const invalid of [
      { sleep_hours: Number.NaN, fatigue: 2 },
      { sleep_hours: 25, fatigue: 2 },
      { sleep_hours: 8, fatigue: 0 },
      { sleep_hours: 8, fatigue: 8 },
      { sleep_hours: 8, fatigue: 1.5 },
    ]) {
      assert.throws(() => predictFatigue([...valid, invalid]), RangeError);
    }
  });
});
