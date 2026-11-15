import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CheckIn } from "../../lib/api/types.ts";
import {
  BAR_MAX_PX,
  HISTORY_COPY,
  barHeight,
  chartCaption,
  chartModel,
  formatRange,
  historySubtitle,
  parseMetric,
  recentRows,
} from "./history-data.ts";

function checkIn(date: string, sleep: number, fatigue: number, mood = 3): CheckIn {
  return {
    id: `id-${date}`,
    check_in_date: date,
    sleep_hours: sleep,
    stress_level: 3,
    mood_level: mood,
    team_conflict_level: 1,
    fatigue,
    description: null,
    created_at: `${date}T12:00:00.000Z`,
    updated_at: `${date}T12:00:00.000Z`,
  };
}

// Figma 30:132 values, returned newest first as the backend does.
const WEEK = [
  checkIn("2026-11-14", 6.5, 6),
  checkIn("2026-11-13", 5.8, 7, 4),
  checkIn("2026-11-12", 6.2, 6),
  checkIn("2026-11-11", 7.4, 3),
  checkIn("2026-11-10", 6.8, 4),
  checkIn("2026-11-09", 7, 4),
  checkIn("2026-11-08", 7.2, 3),
];

describe("parseMetric", () => {
  it("defaults to sleep", () => {
    assert.equal(parseMetric(undefined), "sleep");
    assert.equal(parseMetric("other"), "sleep");
    assert.equal(parseMetric("fatigue"), "fatigue");
    assert.equal(parseMetric(["fatigue", "sleep"]), "fatigue");
  });
});

describe("chartModel", () => {
  it("reproduces the Figma sleep bars (13 px per hour on 0-8 h)", () => {
    const model = chartModel(WEEK, "sleep");
    assert.equal(model.scaleMax, 8);
    assert.deepEqual(
      model.points.map((p) => [p.axisLabel, p.valueLabel, Math.round(p.heightPx * 10) / 10, p.latest]),
      [
        ["8 Nov", "7.2", 93.6, false],
        ["9 Nov", "7", 91, false],
        ["10 Nov", "6.8", 88.4, false],
        ["11 Nov", "7.4", 96.2, false],
        ["12 Nov", "6.2", 80.6, false],
        ["13 Nov", "5.8", 75.4, false],
        ["14 Nov", "6.5", 84.5, true],
      ],
    );
    assert.equal(chartCaption(model), "Hours of sleep · scale 0–8 h");
  });

  it("uses backend fatigue values on the 1-7 scale (no conversion)", () => {
    const model = chartModel(WEEK, "fatigue");
    assert.equal(model.scaleMax, 7);
    assert.deepEqual(
      model.points.map((p) => p.valueLabel),
      ["3", "4", "4", "3", "6", "7", "6"],
    );
    assert.equal(model.points[5].heightPx, BAR_MAX_PX);
    assert.equal(chartCaption(model), "Self-reported fatigue · scale 1–7");
  });

  it("widens the sleep scale when a value is above 8 h", () => {
    const model = chartModel([checkIn("2026-11-14", 9.5, 2)], "sleep");
    assert.equal(model.scaleMax, 10);
    assert.equal(chartCaption(model), "Hours of sleep · scale 0–10 h");
  });

  it("clamps bar heights", () => {
    assert.equal(barHeight(0, 8), 0);
    assert.equal(barHeight(12, 8), BAR_MAX_PX);
  });
});

describe("subtitle and range", () => {
  it("matches the Figma subtitle for the Figma week", () => {
    assert.equal(historySubtitle(WEEK), "Seven daily check-ins · 8–14 Nov 2026 · simulated data");
  });

  it("handles one entry, month and year boundaries, and empty", () => {
    assert.equal(historySubtitle([WEEK[0]]), "One daily check-in · 14 Nov 2026 · simulated data");
    assert.equal(formatRange("2026-10-30", "2026-11-02"), "30 Oct–2 Nov 2026");
    assert.equal(formatRange("2025-12-30", "2026-01-02"), "30 Dec 2025–2 Jan 2026");
    assert.equal(historySubtitle([]), HISTORY_COPY.subtitleFallback);
  });
});

describe("recentRows", () => {
  it("lists the three newest check-ins with backend scales", () => {
    const labels = new Map([
      [3, "Neutral"],
      [4, "Negative"],
    ]);
    assert.deepEqual(recentRows(WEEK, labels), [
      { id: "id-2026-11-14", date: "14 Nov 2026", sleep: "6.5 h", fatigue: "6 / 7", mood: "Neutral" },
      { id: "id-2026-11-13", date: "13 Nov 2026", sleep: "5.8 h", fatigue: "7 / 7", mood: "Negative" },
      { id: "id-2026-11-12", date: "12 Nov 2026", sleep: "6.2 h", fatigue: "6 / 7", mood: "Neutral" },
    ]);
  });

  it("falls back to the numeric mood when labels are unavailable", () => {
    assert.equal(recentRows(WEEK, null)[1].mood, "4 / 5");
  });
});
