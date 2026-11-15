import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCeresRequest } from "./request.ts";

const ci = (date: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${date}`,
  check_in_date: date,
  sleep_hours: 6.5,
  stress_level: 2,
  mood_level: 2,
  team_conflict_level: 1,
  fatigue: 5,
  ...extra,
});

describe("buildCeresRequest", () => {
  it("drops description, session id and timestamps", () => {
    const req = buildCeresRequest([
      ci("2026-11-14", { description: "private text", session_id: "s", created_at: "x", updated_at: "y" }),
    ]);
    assert.deepEqual(Object.keys(req!.check_ins[0]).sort(), [
      "check_in_date",
      "fatigue",
      "id",
      "mood_level",
      "sleep_hours",
      "stress_level",
      "team_conflict_level",
    ]);
  });

  it("orders oldest first", () => {
    const req = buildCeresRequest([ci("2026-11-14"), ci("2026-11-12"), ci("2026-11-13")]);
    assert.deepEqual(req!.check_ins.map((c) => c.check_in_date), ["2026-11-12", "2026-11-13", "2026-11-14"]);
  });

  it("rejects empty or out-of-range history", () => {
    assert.equal(buildCeresRequest([]), null);
    assert.equal(buildCeresRequest("nope"), null);
    assert.equal(buildCeresRequest([ci("2026-11-14", { fatigue: 8 })]), null);
    assert.equal(buildCeresRequest([ci("2026-11-14", { sleep_hours: "7" })]), null);
  });

  it("keeps a ready forecast and ignores a malformed one", () => {
    const ready = { status: "ready", probability_high_fatigue: 0.38, model_version: "eres-v2", predicted_at: "t", extra: 1 };
    assert.deepEqual(buildCeresRequest([ci("2026-11-14")], ready)!.forecast, {
      status: "ready",
      probability_high_fatigue: 0.38,
      model_version: "eres-v2",
      predicted_at: "t",
    });
    assert.equal(buildCeresRequest([ci("2026-11-14")], { status: "ready" })!.forecast, undefined);
    assert.deepEqual(buildCeresRequest([ci("2026-11-14")], { status: "unavailable" })!.forecast, { status: "unavailable" });
  });
});
