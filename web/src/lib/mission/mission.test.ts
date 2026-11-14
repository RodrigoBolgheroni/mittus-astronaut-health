import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { surfaceDistanceKm } from "./geo.ts";
import { createIssPositionReader, parseWhereTheIss } from "./wheretheiss.ts";

// Real response of GET https://api.wheretheiss.at/v1/satellites/25544
const SAMPLE = {
  name: "iss",
  id: 25544,
  latitude: -23.272992327108,
  longitude: 88.299951002974,
  altitude: 430.0464001052,
  velocity: 27543.005354305,
  visibility: "daylight",
  footprint: 4558.2259029317,
  timestamp: 1794693994,
  daynum: 2461359.4212269,
  solar_lat: -18.406002140967,
  solar_lon: 204.47790194061,
  units: "kilometers",
};

const SNAPSHOT = { ...SAMPLE, latitude: 1, longitude: 2, timestamp: 1794600000 };

describe("parseWhereTheIss", () => {
  it("maps the response to a position with an ISO epoch", () => {
    assert.deepEqual(parseWhereTheIss(SAMPLE), {
      latitude: -23.272992327108,
      longitude: 88.299951002974,
      altitudeKm: 430.0464001052,
      velocityKmh: 27543.005354305,
      visibility: "daylight",
      epoch: "2026-11-14T22:06:34.000Z",
    });
  });

  it("rejects responses that are not in kilometers", () => {
    assert.throws(() => parseWhereTheIss({ ...SAMPLE, units: "miles" }));
  });

  it("rejects missing or out-of-range coordinates", () => {
    assert.throws(() => parseWhereTheIss({ ...SAMPLE, latitude: undefined }));
    assert.throws(() => parseWhereTheIss({ ...SAMPLE, latitude: 91 }));
    assert.throws(() => parseWhereTheIss({ ...SAMPLE, longitude: "88" }));
    assert.throws(() => parseWhereTheIss({ ...SAMPLE, timestamp: null }));
    assert.throws(() => parseWhereTheIss(null));
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Fake fetch that answers from a queue and counts calls. */
function fakeFetch(...answers: Array<Response | Error>) {
  const calls: string[] = [];
  const impl = async (url: string | URL | Request) => {
    calls.push(String(url));
    const next = answers.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  };
  return { impl: impl as typeof fetch, calls };
}

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createIssPositionReader", () => {
  it("returns the live position and caches it for the TTL", async () => {
    const f = fakeFetch(jsonResponse(SAMPLE));
    const c = clock();
    const read = createIssPositionReader({ fetchImpl: f.impl, now: c.now, ttlMs: 5000, snapshot: SNAPSHOT });

    const first = await read();
    assert.equal(first.source, "wheretheiss");
    assert.equal(first.latitude, SAMPLE.latitude);

    c.advance(4999);
    await read();
    assert.equal(f.calls.length, 1);
  });

  it("shares one request between concurrent callers", async () => {
    const f = fakeFetch(jsonResponse(SAMPLE));
    const read = createIssPositionReader({ fetchImpl: f.impl, snapshot: SNAPSHOT });
    await Promise.all([read(), read(), read()]);
    assert.equal(f.calls.length, 1);
  });

  it("keeps the last good position when a refresh fails", async () => {
    const f = fakeFetch(jsonResponse(SAMPLE), jsonResponse({ error: "Too Many Requests" }, 429));
    const c = clock();
    const read = createIssPositionReader({ fetchImpl: f.impl, now: c.now, ttlMs: 5000, snapshot: SNAPSHOT });

    await read();
    c.advance(6000);
    const stale = await read();
    assert.equal(stale.source, "wheretheiss");
    assert.equal(stale.epoch, "2026-11-14T22:06:34.000Z");
  });

  it("falls back to the snapshot when nothing was fetched yet", async () => {
    const f = fakeFetch(new Error("network down"));
    const read = createIssPositionReader({ fetchImpl: f.impl, snapshot: SNAPSHOT });
    const pos = await read();
    assert.equal(pos.source, "wheretheiss_snapshot");
    assert.equal(pos.latitude, 1);
  });

  it("waits before retrying after a failure", async () => {
    const f = fakeFetch(new Error("network down"), jsonResponse(SAMPLE));
    const c = clock();
    const read = createIssPositionReader({
      fetchImpl: f.impl,
      now: c.now,
      retryAfterMs: 30000,
      snapshot: SNAPSHOT,
    });

    await read();
    c.advance(29999);
    assert.equal((await read()).source, "wheretheiss_snapshot");
    assert.equal(f.calls.length, 1);

    c.advance(1);
    assert.equal((await read()).source, "wheretheiss");
    assert.equal(f.calls.length, 2);
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
