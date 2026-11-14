import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eme2000ToGeodetic, surfaceDistanceKm } from "./geo.ts";
import { parseOemEpoch, parseOemStateVectors, pickStateVector } from "./oem.ts";

const XML = `<?xml version="1.0"?>
<ndm><oem><body><segment><data>
  <stateVector>
    <EPOCH>2026-318T19:24:00.000Z</EPOCH>
    <X units="km">-1</X><Y units="km">-2</Y><Z units="km">-3</Z>
    <X_DOT units="km/s">0</X_DOT><Y_DOT units="km/s">0</Y_DOT><Z_DOT units="km/s">0</Z_DOT>
  </stateVector>
  <stateVector>
    <EPOCH>2026-318T19:28:00.000Z</EPOCH>
    <X units="km">-2604.5857663474098</X>
    <Y units="km">-5042.0434781554504</Y>
    <Z units="km">-3743.8424507603399</Z>
    <X_DOT units="km/s">3.78941459553787</X_DOT>
    <Y_DOT units="km/s">-5.1099757105505299</Y_DOT>
    <Z_DOT units="km/s">4.2596430253675397</Z_DOT>
  </stateVector>
</data></segment></body></oem></ndm>`;

describe("parseOemEpoch", () => {
  it("parses day-of-year epochs", () => {
    assert.equal(parseOemEpoch("2026-318T19:28:00.000Z").toISOString(), "2026-11-14T19:28:00.000Z");
    assert.equal(parseOemEpoch("2026-001T00:00:30.500Z").toISOString(), "2026-01-01T00:00:30.500Z");
  });

  it("parses calendar epochs", () => {
    assert.equal(parseOemEpoch("2026-11-14T19:28:00.000Z").toISOString(), "2026-11-14T19:28:00.000Z");
  });

  it("rejects garbage", () => {
    assert.throws(() => parseOemEpoch("not a date"));
  });
});

describe("parseOemStateVectors", () => {
  it("reads epoch and position of every vector, ignoring velocity", () => {
    const vectors = parseOemStateVectors(XML);
    assert.equal(vectors.length, 2);
    assert.equal(vectors[1].epoch.toISOString(), "2026-11-14T19:28:00.000Z");
    assert.equal(vectors[1].x, -2604.5857663474098);
    assert.equal(vectors[1].z, -3743.8424507603399);
  });

  it("fails on a file without vectors", () => {
    assert.throws(() => parseOemStateVectors("<ndm></ndm>"));
  });
});

describe("pickStateVector", () => {
  const vectors = parseOemStateVectors(XML);

  it("picks the latest vector at or before the requested time", () => {
    const v = pickStateVector(vectors, new Date("2026-11-14T19:27:59Z"));
    assert.equal(v?.epoch.toISOString(), "2026-11-14T19:24:00.000Z");
  });

  it("returns null before the file starts or long after it ends", () => {
    assert.equal(pickStateVector(vectors, new Date("2026-11-14T19:00:00Z")), null);
    assert.equal(pickStateVector(vectors, new Date("2026-11-14T20:00:00Z")), null);
  });
});

describe("eme2000ToGeodetic", () => {
  it("matches an independent ISS position source", () => {
    // Reference for 2026-11-14T19:28:00Z from api.wheretheiss.at (TLE based):
    // lat -33.658, lon -102.812, alt 427.3 km.
    const [, v] = parseOemStateVectors(XML);
    const g = eme2000ToGeodetic([v.x, v.y, v.z], v.epoch);
    assert.ok(Math.abs(g.latitude - -33.658) < 0.05, `latitude ${g.latitude}`);
    assert.ok(Math.abs(g.longitude - -102.812) < 0.05, `longitude ${g.longitude}`);
    assert.ok(Math.abs(g.altitudeKm - 427.3) < 1, `altitude ${g.altitudeKm}`);
  });

  it("handles a point over the north pole", () => {
    const g = eme2000ToGeodetic([0, 0, 6356.752 + 400], new Date("2026-11-14T00:00:00Z"));
    // Precession since J2000 tilts the pole of date by ~0.36 degrees.
    assert.ok(g.latitude > 89.5, `latitude ${g.latitude}`);
    assert.ok(Math.abs(g.altitudeKm - 400) < 0.5, `altitude ${g.altitudeKm}`);
  });
});

describe("surfaceDistanceKm", () => {
  it("is zero for the same point", () => {
    assert.equal(surfaceDistanceKm({ latitude: 10, longitude: 20 }, { latitude: 10, longitude: 20 }), 0);
  });

  it("matches known great-circle distances", () => {
    // A quarter of the equator.
    const quarter = surfaceDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 90 });
    assert.ok(Math.abs(quarter - 10007.5) < 1, `quarter ${quarter}`);
    // Sao Paulo (GRU) to Lisbon (LIS) is about 7,950 km.
    const gruLis = surfaceDistanceKm({ latitude: -23.4356, longitude: -46.4731 }, { latitude: 38.7813, longitude: -9.1359 });
    assert.ok(Math.abs(gruLis - 7950) < 50, `GRU-LIS ${gruLis}`);
  });

  it("goes the short way across the antimeridian", () => {
    const d = surfaceDistanceKm({ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 });
    assert.ok(Math.abs(d - 222.4) < 1, `antimeridian ${d}`);
  });
});
