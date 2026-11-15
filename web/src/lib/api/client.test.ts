import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  ApiError,
  evaluateCheckInActions,
  generateInsight,
  getMissionContext,
  listCheckIns,
  putCheckIn,
  updateCheckInAction,
} from "./client.ts";

type Call = { url: string; init: RequestInit };
const realFetch = globalThis.fetch;
let calls: Call[] = [];

function mockFetch(...responses: Array<Response | Error>) {
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const next = responses.shift() ?? new Response("{}", { status: 200 });
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("api client", () => {
  it("PUTs a check-in with credentials and JSON body", async () => {
    mockFetch(json({ id: "1" }));
    const body = { sleep_hours: 7, stress_level: 2, mood_level: 3, team_conflict_level: 1, fatigue: 2 };
    await putCheckIn("2026-01-02", body);
    assert.equal(calls[0].url, "http://localhost:3001/api/check-ins/2026-01-02");
    assert.equal(calls[0].init.method, "PUT");
    assert.equal(calls[0].init.credentials, "include");
    assert.equal(calls[0].init.body, JSON.stringify(body));
  });

  it("lists check-ins with limit", async () => {
    mockFetch(json({ items: [] }));
    await listCheckIns(7);
    assert.equal(calls[0].url, "http://localhost:3001/api/check-ins?limit=7");
    assert.equal(calls[0].init.method, "GET");
  });

  it("POSTs evaluate with no body", async () => {
    mockFetch(json({ status: "ready", action: null, explanation: "" }));
    await evaluateCheckInActions("abc");
    assert.equal(calls[0].url, "http://localhost:3001/api/check-ins/abc/actions/evaluate");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body, undefined);
  });

  it("PATCHes an action status", async () => {
    mockFetch(json({ id: "a" }));
    await updateCheckInAction("a", "completed");
    assert.equal(calls[0].url, "http://localhost:3001/api/check-in-actions/a");
    assert.equal(calls[0].init.method, "PATCH");
    assert.equal(calls[0].init.body, JSON.stringify({ status: "completed" }));
  });

  it("uses same-origin path for mission context", async () => {
    mockFetch(json({ phase: "in_orbit" }));
    await getMissionContext("in_orbit");
    assert.equal(calls[0].url, "/api/mission-context?phase=in_orbit");
    assert.equal(calls[0].init.credentials, "include");
  });

  it("throws a typed ApiError with the body on 409", async () => {
    const body = { statusCode: 409, code: "EVALUATION_OUTDATED", message: "Evaluate again." };
    mockFetch(json(body, 409));
    await assert.rejects(evaluateCheckInActions("abc"), (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 409);
      assert.equal(e.code, "EVALUATION_OUTDATED");
      assert.deepEqual(e.body, body);
      return true;
    });
  });

  it("generateInsight returns a mock on 404", async () => {
    const item = {
      id: "c1", check_in_date: "2026-01-02", sleep_hours: 7, stress_level: 2, mood_level: 3,
      team_conflict_level: 1, fatigue: 2, description: null, created_at: "", updated_at: "",
    };
    mockFetch(json({ message: "Not Found" }, 404), json({ items: [item], today: "x", timezone: "UTC" }));
    const insight = await generateInsight("c1");
    assert.equal(calls[0].url, "http://localhost:3001/api/check-in-insights");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(insight.source, "mock");
    assert.match(insight.text, /sleep 7 h/);
  });

  it("generateInsight returns api text when available", async () => {
    mockFetch(json({ text: "hello" }));
    assert.deepEqual(await generateInsight("c1"), { text: "hello", source: "api" });
  });
});
