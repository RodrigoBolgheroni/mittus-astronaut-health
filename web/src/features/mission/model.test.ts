import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildQuery,
  buildStars,
  formatCelsius,
  formatUtc,
  OVERVIEW_TRANSFORM,
  parseDirection,
  parseFocus,
  PHASE_BY_DIRECTION,
  positionSourceTag,
  ZOOM_TARGET_OVERLAY,
  zoomTransform,
} from "./model.ts";

test("direction and focus parsing", () => {
  assert.equal(parseDirection("return"), "return");
  assert.equal(parseDirection("nope"), "outbound");
  assert.equal(parseDirection(null), "outbound");
  assert.equal(parseFocus("moon"), "moon");
  assert.equal(parseFocus("sun"), null);
  assert.equal(PHASE_BY_DIRECTION.outbound, "in_orbit");
  assert.equal(PHASE_BY_DIRECTION.return, "return_to_earth");
  assert.equal(buildQuery("outbound", null), "");
  assert.equal(buildQuery("return", "earth"), "?direction=return&focus=earth");
});

test("zoom transforms reproduce the Figma world offsets", () => {
  // 52:1306 world offset (-34.5, -287.3), 52:1463 (-547.15, -107.85), 52:1620 (-1801.05, -67.15)
  const earth = zoomTransform("earth", "outbound", ZOOM_TARGET_OVERLAY);
  assert.ok(Math.abs(earth.x - -34.5) < 0.01 && Math.abs(earth.y - -287.3) < 0.01);
  const ship = zoomTransform("spacecraft", "outbound", ZOOM_TARGET_OVERLAY);
  assert.ok(Math.abs(ship.x - -547.15) < 0.01 && Math.abs(ship.y - -107.85) < 0.01);
  const moon = zoomTransform("moon", "outbound", ZOOM_TARGET_OVERLAY);
  assert.ok(Math.abs(moon.x - -1801.05) < 0.01 && Math.abs(moon.y - -67.15) < 0.01);
  assert.equal(OVERVIEW_TRANSFORM.scale, 1);
});

test("stars", () => {
  const stars = buildStars();
  assert.equal(stars.length, 52);
  assert.deepEqual(stars[1], { left: 179, top: 117, size: 1 });
  assert.deepEqual(stars[9], { left: 431, top: 443, size: 2 });
  assert.deepEqual(stars[51], { left: 109, top: 467, size: 1 });
});

test("formatters", () => {
  assert.equal(formatUtc("2026-11-14T14:20:00Z"), "14 Nov · 14:20 UTC");
  assert.equal(formatUtc("2026-11-14T14:20:00Z", true), "14 Nov 2026 · 14:20 UTC");
  assert.equal(formatUtc(null), null);
  assert.equal(formatUtc("garbage"), null);
  assert.equal(formatCelsius(22.4), "22.4°C");
  assert.equal(formatCelsius(null), null);
  assert.equal(positionSourceTag("celestrak_tle"), "TLE");
  assert.equal(positionSourceTag("wheretheiss_snapshot"), "Snapshot");
});

import { describeTrajectory, detailRows } from "./model.ts";
import type { MissionContext } from "@/lib/api/types";

const CTX = {
  phase: "return_to_earth",
  phaseLabel: "Return to Earth",
  status: "Undocked, descending to splashdown",
  vehicle: "Crew Dragon",
  mission: { code: "X", name: "Demo", registrySource: "built_in" },
  departure: {
    name: "International Space Station",
    departedAt: null,
    departedAtSource: null,
    coordinates: { latitude: 0, longitude: 0, asOf: null, source: "simulated", label: "", sourceUrl: null },
  },
  location: {
    latitude: 31.2,
    longitude: -121.4,
    altitudeKm: 180,
    asOf: null,
    source: "simulated",
    label: "Simulated: descent point",
    sourceUrl: null,
  },
  destination: {
    name: "Earth",
    description: "Splashdown zone",
    coordinates: { latitude: 0, longitude: 0, asOf: null, source: "simulated", label: "", sourceUrl: null },
    distanceKm: 1234.4,
  },
  cabinTemperature: { celsius: 23.5, measuredAt: null, source: "simulated", status: "ok", label: "Simulated cabin", sourceUrl: null },
  missionReference: null,
} as MissionContext;

test("detail rows only use contract data", () => {
  const ship = detailRows("spacecraft", CTX);
  assert.equal(ship[1]?.value, "23.5°C");
  assert.equal(ship[3]?.value, "Simulated");
  assert.equal(detailRows("earth", CTX)[1]?.value, "Not recorded");
  assert.equal(detailRows("moon", CTX)[2]?.value, "1,234 km");
  assert.match(describeTrajectory(CTX), /Position source: Simulated/);
});
