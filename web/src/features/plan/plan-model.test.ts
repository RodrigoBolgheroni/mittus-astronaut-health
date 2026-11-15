import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conflictMessage, currentAction, formatLogDate, latestCheckIn, planStatus, taskTitle } from "./plan-model.ts";

const action = (id: string, status: string) =>
  ({
    id,
    check_in_id: "c",
    evaluation_key: "k",
    action_code: "monitor",
    reason_code: "r",
    ruleset_version: "v",
    forecast_snapshot: null,
    status,
    created_at: "2026-11-14T14:35:00.000Z",
    acknowledged_at: null,
    resolved_at: null,
  }) as const;

describe("plan model", () => {
  it("picks the newest non-superseded action", () => {
    assert.equal(currentAction([action("a", "suggested"), action("b", "superseded")])?.id, "a");
    assert.equal(currentAction([action("a", "superseded")]), null);
    assert.equal(currentAction([]), null);
  });
  it("maps statuses and ignores unknown ones", () => {
    assert.equal(planStatus("acknowledged"), "acknowledged");
    assert.equal(planStatus("pending"), null);
  });
  it("formats the log date in UTC", () => {
    assert.equal(formatLogDate("2026-11-14T14:35:00.000Z"), "14 Nov 2026 · 14:35");
    assert.equal(formatLogDate("nope"), "");
  });
  it("finds the latest check-in and names tasks", () => {
    const c = (d: string) => ({ id: d, check_in_date: d }) as never;
    assert.equal(latestCheckIn([c("2026-11-12"), c("2026-11-14"), c("2026-11-13")])?.id, "2026-11-14");
    assert.equal(taskTitle("monitor"), "Keep tracking your daily check-ins");
  });
  it("has a message for every 409 code", () => {
    for (const code of ["ACTION_NOT_PENDING", "CHECK_IN_NOT_LATEST", "EVALUATION_OUTDATED", undefined]) {
      assert.ok(conflictMessage(code).length > 0);
    }
  });
});
