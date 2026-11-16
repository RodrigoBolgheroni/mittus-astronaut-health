import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conflictMessage, formatLogDate, latestCheckIn, planStatus } from "./plan-model.ts";


describe("plan model", () => {
  it("maps statuses and ignores unknown ones", () => {
    assert.equal(planStatus("acknowledged"), "acknowledged");
    assert.equal(planStatus("pending"), null);
  });
  it("formats the log date in UTC", () => {
    assert.equal(formatLogDate("2026-11-14T14:35:00.000Z"), "14 Nov 2026 · 14:35");
    assert.equal(formatLogDate("nope"), "");
  });
  it("finds the latest check-in", () => {
    const c = (d: string) => ({ id: d, check_in_date: d }) as never;
    assert.equal(latestCheckIn([c("2026-11-12"), c("2026-11-14"), c("2026-11-13")])?.id, "2026-11-14");
  });
  it("has a message for every 409 code", () => {
    for (const code of ["ACTION_NOT_PENDING", "CHECK_IN_NOT_LATEST", "EVALUATION_OUTDATED", undefined]) {
      assert.ok(conflictMessage(code).length > 0);
    }
  });
});
