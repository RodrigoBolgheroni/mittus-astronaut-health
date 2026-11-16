import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { handleMissionRegistration } from "./mission-registration-handler.ts";
import type { MissionRegistration } from "./mission-registration.ts";
import type { RegisterResult } from "./mission-store.ts";

const SECRET = "a".repeat(32);
const SESSION_ID = "2c03cc75-f572-4e85-a96d-26fa60dc8e1b";
const NOW = 1_800_000_000;
const ORIGIN = "https://mittus.example";

function token(secret = SECRET, expiration = NOW + 60) {
  const payload = `${SESSION_ID}.${expiration}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

function registration(overrides = {}) {
  return {
    name: "Lunar return",
    code: "lunar-return",
    legs: {
      in_orbit: {
        departurePlace: "cape_canaveral_slc_40",
        destinationPlace: "iss",
        destinationDescription: "Dock with the station.",
      },
      return_to_earth: {
        departurePlace: "iss",
        destinationPlace: "pacific_splashdown_california",
        destinationDescription: "Return to Earth.",
      },
    },
    ...overrides,
  };
}

function request(body: unknown = registration(), headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/missions`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function harness(result: RegisterResult = { ok: true, code: "lunar-return" }) {
  const writes: { registration: MissionRegistration; sessionId: string }[] = [];
  return {
    writes,
    options: {
      sessionSecret: SECRET,
      webOrigin: ORIGIN as string | undefined,
      nowSeconds: NOW,
      register: async (registration: MissionRegistration, sessionId: string): Promise<RegisterResult> => {
        writes.push({ registration, sessionId });
        return result;
      },
    },
  };
}

describe("mission registration request", () => {
  it("rejects missing, tampered and expired sessions before persistence", async () => {
    for (const sessionToken of [undefined, "invalid", token("b".repeat(32)), token(SECRET, NOW)]) {
      const { options, writes } = harness();
      const response = await handleMissionRegistration(request(), sessionToken, options);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: "session_required" });
      assert.deepEqual(writes, []);
    }
  });

  it("does not allow global-demo requests to bypass session authorization", async () => {
    const { options, writes } = harness();
    const response = await handleMissionRegistration(request(registration({ isDemo: true })), undefined, options);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "session_required" });
    assert.deepEqual(writes, []);
  });

  it("rejects global-demo selection even with a valid signed session", async () => {
    const { options, writes } = harness();
    const response = await handleMissionRegistration(request(registration({ isDemo: true })), token(), options);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "invalid_registration");
    assert.equal(typeof body.fields.isDemo, "string");
    assert.deepEqual(writes, []);
  });

  it("rejects cross-origin, null and malformed origins without trusting forwarded headers", async () => {
    for (const origin of ["https://attacker.example", "null", `${ORIGIN}/path`, ""]) {
      const { options, writes } = harness();
      const response = await handleMissionRegistration(
        request(registration(), { origin, "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https", "x-forwarded-origin": origin }),
        token(),
        options,
      );
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "origin_not_allowed" });
      assert.deepEqual(writes, []);
    }
  });

  it("uses WEB_ORIGIN instead of trusting the request URL or forwarded origin", async () => {
    const { options, writes } = harness();
    const forged = new Request("https://attacker.example/api/missions", {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json", "x-forwarded-origin": ORIGIN },
      body: JSON.stringify(registration()),
    });
    const response = await handleMissionRegistration(forged, token(), options);
    assert.equal(response.status, 403);
    assert.deepEqual(writes, []);
  });

  it("uses the request URL origin when WEB_ORIGIN is unavailable", async () => {
    const { options, writes } = harness();
    options.webOrigin = undefined;
    const response = await handleMissionRegistration(request(), token(), options);
    assert.equal(response.status, 201);
    assert.equal(writes.length, 1);

    const denied = await handleMissionRegistration(request(registration(), { origin: "https://attacker.example" }), token(), options);
    assert.equal(denied.status, 403);
    assert.equal(writes.length, 1);
  });

  it("fails closed on an invalid configured WEB_ORIGIN", async () => {
    const { options, writes } = harness();
    options.webOrigin = `${ORIGIN}/path`;
    const response = await handleMissionRegistration(request(), token(), options);
    assert.equal(response.status, 503);
    assert.deepEqual(writes, []);
  });

  it("rejects simple-request content types before parsing or persistence", async () => {
    for (const contentType of ["text/plain", "text/plain; charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data", ""]) {
      const { options, writes } = harness();
      const response = await handleMissionRegistration(request(registration(), { "content-type": contentType }), token(), options);
      assert.equal(response.status, 415);
      assert.deepEqual(await response.json(), { error: "unsupported_media_type" });
      assert.deepEqual(writes, []);
    }
  });

  it("registers an ordinary mission for its verified session using same-origin JSON", async () => {
    const { options, writes } = harness();
    const response = await handleMissionRegistration(request(registration(), { "content-type": "application/json; charset=utf-8" }), token(), options);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { code: "lunar-return" });
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.sessionId, SESSION_ID);
    assert.equal(writes[0]!.registration.code, "lunar-return");
    assert.equal("isDemo" in writes[0]!.registration, false);
  });

  it("allows nonbrowser requests without Origin only with a valid session", async () => {
    for (const sessionToken of [token(), undefined]) {
      const { options, writes } = harness();
      const nonbrowser = request();
      nonbrowser.headers.delete("origin");
      const response = await handleMissionRegistration(nonbrowser, sessionToken, options);
      assert.equal(response.status, sessionToken ? 201 : 409);
      assert.equal(writes.length, sessionToken ? 1 : 0);
    }
  });

  it("does not persist invalid JSON or invalid mission fields", async () => {
    const { options, writes } = harness();
    const malformed = new Request(`${ORIGIN}/api/missions`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: "{",
    });
    const invalidJson = await handleMissionRegistration(malformed, token(), options);
    assert.equal(invalidJson.status, 400);
    assert.deepEqual(await invalidJson.json(), { error: "invalid_json" });
    const invalidFields = await handleMissionRegistration(request(registration({ code: "Invalid Code" })), token(), options);
    assert.equal(invalidFields.status, 400);
    assert.equal((await invalidFields.json()).error, "invalid_registration");
    assert.deepEqual(writes, []);
  });

  it("preserves code_taken, unknown_place and registry-unavailable responses", async () => {
    for (const [reason, status, error] of [
      ["code_taken", 409, "code_taken"],
      ["unknown_place", 400, "unknown_place"],
      ["unavailable", 503, "registry_unavailable"],
    ] as const) {
      const { options } = harness({ ok: false, reason });
      const response = await handleMissionRegistration(request(), token(), options);
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.error, error);
      if (reason === "code_taken") assert.deepEqual(body.fields, { code: "This mission code is already registered." });
    }
  });
});
