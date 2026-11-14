import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { celestrakUrl, createSpacecraftPositionReader, positionFromOmm } from "./celestrak.ts";
import { surfaceDistanceKm } from "./geo.ts";

// Real CelesTrak GP response for Crew Dragon 13 (NORAD 100882), docked to the ISS.
const DRAGON_13 = {
  OBJECT_NAME: "CREW DRAGON 13",
  OBJECT_ID: "2026-226A",
  EPOCH: "2026-11-14T04:10:44.607360",
  MEAN_MOTION: 15.49365732,
  ECCENTRICITY: 0.00073685,
  INCLINATION: 51.6324,
  RA_OF_ASC_NODE: 277.8691,
  ARG_OF_PERICENTER: 23.754,
  MEAN_ANOMALY: 336.3788,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 100882,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 699,
  BSTAR: 0.00017665023,
  MEAN_MOTION_DOT: 9.423e-5,
  MEAN_MOTION_DDOT: 0,
};

// ISS from api.wheretheiss.at/v1/satellites/25544?timestamp=1794700000
const ISS_AT = new Date(1794700000 * 1000);
const ISS_REFERENCE = { latitude: -41.845642656545, longitude: 87.9019865281, altitudeKm: 436.58047521178 };

describe("positionFromOmm", () => {
  it("puts a docked Crew Dragon at the ISS position", () => {
    const pos = positionFromOmm(DRAGON_13, ISS_AT);
    const d = surfaceDistanceKm(pos, ISS_REFERENCE);
    assert.ok(d < 25, `distance to ISS ${d} km`);
    assert.ok(Math.abs(pos.altitudeKm - ISS_REFERENCE.altitudeKm) < 5, `altitude ${pos.altitudeKm}`);
    assert.equal(pos.epoch, ISS_AT.toISOString());
    assert.equal(pos.elementsEpoch, "2026-11-14T04:10:44.607Z");
  });

  it("refuses elements that are too old to trust", () => {
    const fourDaysLater = new Date(Date.parse("2026-11-18T04:10:45Z"));
    assert.throws(() => positionFromOmm(DRAGON_13, fourDaysLater), /too old/);
  });

  it("rejects a response that is not an OMM record", () => {
    assert.throws(() => positionFromOmm({ OBJECT_NAME: "X" }, ISS_AT));
  });
});

function fakeFetch(...answers: Response[]) {
  const calls: string[] = [];
  const impl = async (url: string | URL | Request) => {
    calls.push(String(url));
    const next = answers.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  };
  return { impl: impl as typeof fetch, calls };
}

describe("createSpacecraftPositionReader", () => {
  it("downloads the elements once per TTL and propagates on every read", async () => {
    const f = fakeFetch(Response.json([DRAGON_13]));
    let t = ISS_AT.getTime();
    const read = createSpacecraftPositionReader({ fetchImpl: f.impl, now: () => t });

    const first = await read(100882);
    t += 60_000;
    const second = await read(100882);

    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0], celestrakUrl(100882));
    assert.equal(first.source, "celestrak_tle");
    assert.notEqual(first.longitude, second.longitude, "the craft moved in a minute");
  });

  it("fails when CelesTrak has no data and nothing is cached", async () => {
    const f = fakeFetch(new Response("No GP data found", { status: 404 }));
    const read = createSpacecraftPositionReader({ fetchImpl: f.impl, now: () => ISS_AT.getTime() });
    await assert.rejects(read(999999), /no orbital elements/);
  });
});
