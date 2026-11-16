import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBasicSummary } from "./basic-summary.ts";

const c = (id: string, sleep_hours: number, fatigue: number) => ({ id, sleep_hours, fatigue }) as never;

describe("buildBasicSummary", () => {
  it("compares the latest check-in with the previous average (Figma 32:457)", () => {
    const latest = c("a", 6.5, 6);
    const summary = buildBasicSummary(latest, [latest, c("b", 7, 4), c("c", 6.4, 5)]);
    assert.equal(
      summary.text,
      "Sleep · 6.5 h today / 6.7 h previous average\nDifference · −0.2 h\n\n" +
        "Fatigue · 6/7 today / 4.5/7 previous average\nDifference · +1.5 points",
    );
    assert.equal(summary.note, "Comparison with 2 previous check-ins. This summary uses your recorded values.");
  });

  it("shows only today's values without previous check-ins", () => {
    const latest = c("a", 7, 3);
    const summary = buildBasicSummary(latest, [latest]);
    assert.equal(summary.text, "Sleep · 7 h today\n\nFatigue · 3/7 today");
    assert.equal(summary.note, "This summary uses your recorded values.");
  });
});
