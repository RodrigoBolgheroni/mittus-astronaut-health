import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseUtcDateTime, validateRegistration } from "./mission-registration.ts";

const leg = (overrides = {}) => ({
  departurePlace: "cape_canaveral_slc_40",
  destinationPlace: "iss",
  departureAt: "",
  departureAtSource: "",
  destinationDescription: "Dock with the station.",
  ...overrides,
});

const valid = (overrides = {}) => ({
  name: "Lunar return",
  code: "lunar-return",
  noradId: "",
  ll2LaunchId: "",
  referenceLabel: "",
  referenceUrl: "https://",
  isDemo: false,
  legs: { in_orbit: leg(), return_to_earth: leg({ departurePlace: "iss", destinationPlace: "pacific_splashdown_california" }) },
  ...overrides,
});

describe("validateRegistration", () => {
  it("accepts a complete form and normalizes optional fields", () => {
    const result = validateRegistration(valid({ noradId: "25544" }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.noradId, 25544);
    assert.equal(result.value.referenceUrl, null, "the https:// starting text counts as empty");
    assert.equal(result.value.legs.in_orbit.departureAt, null);
  });

  it("follows the database checks", () => {
    const result = validateRegistration(
      valid({
        name: " ",
        code: "Lunar Return",
        noradId: "-3",
        ll2LaunchId: "abc",
        referenceUrl: "ftp://x",
        legs: {
          in_orbit: leg({ destinationPlace: "cape_canaveral_slc_40", departureAt: "2026-02-13 10:15" }),
          return_to_earth: leg({ departureAtSource: "manual", destinationDescription: "" }),
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(Object.keys(result.errors).sort(), [
      "code",
      "legs.in_orbit.departureAtSource",
      "legs.in_orbit.destinationPlace",
      "legs.return_to_earth.departureAt",
      "legs.return_to_earth.destinationDescription",
      "ll2LaunchId",
      "name",
      "noradId",
      "referenceUrl",
    ]);
  });
});

describe("parseUtcDateTime", () => {
  it("reads the typed UTC format and ISO strings", () => {
    assert.equal(parseUtcDateTime("2026-02-13 10:15"), "2026-02-13T10:15:00.000Z");
    assert.equal(parseUtcDateTime("2026-02-13T10:15:56Z"), "2026-02-13T10:15:56.000Z");
  });

  it("rejects impossible dates", () => {
    assert.equal(parseUtcDateTime("2026-02-31 10:15"), null);
    assert.equal(parseUtcDateTime("13/02/2026"), null);
  });
});
