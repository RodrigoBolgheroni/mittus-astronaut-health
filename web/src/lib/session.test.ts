import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { verifySessionToken } from "./session.ts";

const SECRET = "a".repeat(32);
const ID = "2c03cc75-f572-4e85-a96d-26fa60dc8e1b";
const NOW = 1_800_000_000;

// Same signing as backend/src/session/session.middleware.ts.
function token(id = ID, expiresAt = NOW + 60, secret = SECRET) {
  const payload = `${id}.${expiresAt}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

describe("verifySessionToken", () => {
  it("accepts a token signed by the backend", () => {
    assert.equal(verifySessionToken(token(), SECRET, NOW), ID);
  });

  it("rejects a token signed with another secret", () => {
    assert.equal(verifySessionToken(token(ID, NOW + 60, "b".repeat(32)), SECRET, NOW), null);
  });

  it("rejects an expired token", () => {
    assert.equal(verifySessionToken(token(ID, NOW), SECRET, NOW), null);
  });

  it("rejects a tampered session id", () => {
    const tampered = token().replace(ID, "3c03cc75-f572-4e85-a96d-26fa60dc8e1b");
    assert.equal(verifySessionToken(tampered, SECRET, NOW), null);
  });

  it("rejects malformed input and a missing or short secret", () => {
    assert.equal(verifySessionToken(undefined, SECRET, NOW), null);
    assert.equal(verifySessionToken("garbage", SECRET, NOW), null);
    assert.equal(verifySessionToken(`${token()}.extra`, SECRET, NOW), null);
    assert.equal(verifySessionToken(token(), undefined, NOW), null);
    assert.equal(verifySessionToken(token(), "short", NOW), null);
  });
});
