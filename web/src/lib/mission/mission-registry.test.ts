import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BUILT_IN_DEMO_LEGS, legFromRow, type MissionLegRow } from "./mission-registry.ts";

const place = (prefix: "dep_" | "dst_", values: Partial<Record<string, unknown>>) =>
  Object.fromEntries(
    Object.entries({
      name: "x",
      label: "x",
      kind: "fixed",
      tracked_object: null,
      latitude: null,
      longitude: null,
      source: null,
      simulated: false,
      source_url: null,
      ...values,
    }).map(([k, v]) => [`${prefix}${k}`, v]),
  );

const ROW = {
  mission_code: "demo-crew-12",
  mission_name: "Mittus demo mission",
  reference_label: "NASA SpaceX Crew-12 mission profile",
  reference_url: "https://www.nasa.gov/mission/nasas-spacex-crew-12/",
  phase: "in_orbit",
  departure_at: new Date("2026-02-13T10:15:56Z"),
  departure_at_source: "ll2",
  destination_description: "Docked.",
  ...place("dep_", {
    name: "Cape Canaveral",
    label: "Space Launch Complex 40",
    latitude: 28.56194122,
    longitude: -80.57735736,
    source: "ll2",
    source_url: "https://ll.thespacedevs.com/x",
  }),
  ...place("dst_", { name: "International Space Station", label: "ISS", kind: "tracked", tracked_object: "iss" }),
} as unknown as MissionLegRow;

describe("legFromRow", () => {
  it("maps a fixed departure and a tracked destination", () => {
    const leg = legFromRow(ROW);
    assert.equal(leg.phase, "in_orbit");
    assert.equal(leg.mission.origin, "database");
    assert.deepEqual(leg.mission.reference, {
      label: "NASA SpaceX Crew-12 mission profile",
      url: "https://www.nasa.gov/mission/nasas-spacex-crew-12/",
    });
    assert.equal(leg.departure.at, "2026-02-13T10:15:56.000Z");
    assert.equal(leg.departure.atSource, "ll2");
    assert.deepEqual(leg.departure.place, {
      kind: "fixed",
      name: "Cape Canaveral",
      label: "Space Launch Complex 40",
      latitude: 28.56194122,
      longitude: -80.57735736,
      source: "ll2",
      simulated: false,
      sourceUrl: "https://ll.thespacedevs.com/x",
    });
    assert.deepEqual(leg.destination.place, {
      kind: "tracked",
      object: "iss",
      name: "International Space Station",
      label: "ISS",
    });
  });

  it("keeps a missing departure time and reference as null", () => {
    const leg = legFromRow({ ...ROW, departure_at: null, departure_at_source: null, reference_url: null });
    assert.equal(leg.departure.at, null);
    assert.equal(leg.departure.atSource, null);
    assert.equal(leg.mission.reference, null);
  });

  it("converts numeric strings from the driver to numbers", () => {
    const leg = legFromRow({ ...ROW, dep_latitude: "28.5" as unknown as number });
    assert.equal(leg.departure.place.kind === "fixed" && leg.departure.place.latitude, 28.5);
  });

  it("rejects an unknown tracked object", () => {
    assert.throws(() => legFromRow({ ...ROW, dst_tracked_object: "tiangong" }), /Unsupported tracked object/);
  });
});

describe("BUILT_IN_DEMO_LEGS", () => {
  it("chains the legs: the return departs from where the first leg arrives", () => {
    assert.deepEqual(BUILT_IN_DEMO_LEGS.return_to_earth.departure.place, BUILT_IN_DEMO_LEGS.in_orbit.destination.place);
  });

  it("is marked as built-in", () => {
    assert.equal(BUILT_IN_DEMO_LEGS.in_orbit.mission.origin, "built_in");
  });
});
