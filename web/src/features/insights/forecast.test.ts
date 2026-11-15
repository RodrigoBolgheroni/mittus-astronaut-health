import assert from "node:assert/strict";
import { test } from "node:test";

import { ceresForecastFromAction, latestCheckIn, percentFromAction, probabilityFromSnapshot } from "./forecast.ts";

test("probabilityFromSnapshot accepts only 0-1 numbers", () => {
  assert.equal(probabilityFromSnapshot({ probability_high_fatigue: 0.38 }), 0.38);
  assert.equal(probabilityFromSnapshot({ probability_high_fatigue: 1.2 }), null);
  assert.equal(probabilityFromSnapshot({ probability_high_fatigue: "0.3" }), null);
  assert.equal(probabilityFromSnapshot(null), null);
});

test("percentFromAction rounds", () => {
  const action = { forecast_snapshot: { probability_high_fatigue: 0.384 } } as never;
  assert.equal(percentFromAction(action), 38);
  assert.equal(percentFromAction(null), null);
});

test("latestCheckIn picks the newest date", () => {
  const items = [{ check_in_date: "2026-11-13" }, { check_in_date: "2026-11-14" }, { check_in_date: "2026-11-12" }] as never[];
  assert.equal(latestCheckIn(items)?.check_in_date, "2026-11-14");
  assert.equal(latestCheckIn([]), null);
});

test("ceresForecastFromAction needs every Eres field", () => {
  const ok = { forecast_snapshot: { probability_high_fatigue: 0.38, model_version: "eres-v2", predicted_at: "2026-11-14T12:00:00.000Z" } } as never;
  assert.deepEqual(ceresForecastFromAction(ok), {
    status: "ready",
    probability_high_fatigue: 0.38,
    model_version: "eres-v2",
    predicted_at: "2026-11-14T12:00:00.000Z",
  });
  assert.equal(ceresForecastFromAction({ forecast_snapshot: { probability_high_fatigue: 0.38 } } as never), null);
  assert.equal(ceresForecastFromAction(null), null);
});
