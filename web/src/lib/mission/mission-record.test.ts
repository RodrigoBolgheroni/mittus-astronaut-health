import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CURRENT_POSITION } from "./mission-config.ts";
import { toMissionLegRecord, toPlace, type MissionLegRow, type MissionRow, type PlaceRow } from "./mission-record.ts";

// Rows as stored in the Supabase project (migration 20261114220000_create_missions).
const MISSION: MissionRow = {
  id: "dfb6b946-604b-4823-b73d-91c0b72c7ec2",
  code: "demo-crew-12",
  name: "Mittus demo mission",
  norad_id: null,
  reference_label: "NASA SpaceX Crew-12 mission profile",
  reference_url: "https://www.nasa.gov/mission/nasas-spacex-crew-12/",
};

const CAPE: PlaceRow = {
  code: "cape_canaveral_slc_40",
  name: "Cape Canaveral",
  label: "Space Launch Complex 40, Cape Canaveral SFS, FL, USA",
  kind: "fixed",
  tracked_object: null,
  latitude: 28.56194122,
  longitude: -80.57735736,
  source: "ll2",
  simulated: false,
  source_url: "https://ll.thespacedevs.com/2.3.0/launches/862b54e3-7bf8-48e5-8cd1-d77257d5fde9/",
};

const ISS: PlaceRow = {
  code: "iss",
  name: "International Space Station",
  label: "International Space Station",
  kind: "tracked",
  tracked_object: "iss",
  latitude: null,
  longitude: null,
  source: null,
  simulated: false,
  source_url: null,
};

const PACIFIC: PlaceRow = {
  code: "pacific_splashdown_california",
  name: "Earth",
  label: "Pacific splashdown zone off California",
  kind: "fixed",
  tracked_object: null,
  latitude: 32.6,
  longitude: -118.2,
  source: "manual",
  simulated: true,
  source_url: null,
};

const IN_ORBIT: MissionLegRow = {
  phase: "in_orbit",
  departure_at: new Date("2026-02-13T10:15:56Z"),
  departure_at_source: "ll2",
  destination_description: "Crew Dragon flew to the ISS and stays docked while the crew lives aboard.",
  departure_place: CAPE,
  destination_place: ISS,
};

const RETURN: MissionLegRow = {
  phase: "return_to_earth",
  departure_at: null,
  departure_at_source: null,
  destination_description: "Crew Dragon brings the crew back to a splashdown zone in the ocean.",
  departure_place: ISS,
  destination_place: PACIFIC,
};

describe("toPlace", () => {
  it("maps a fixed place with its source", () => {
    assert.deepEqual(toPlace(CAPE), {
      kind: "fixed",
      code: "cape_canaveral_slc_40",
      name: "Cape Canaveral",
      label: "Space Launch Complex 40, Cape Canaveral SFS, FL, USA",
      latitude: 28.56194122,
      longitude: -80.57735736,
      source: "ll2",
      simulated: false,
      sourceUrl: CAPE.source_url,
    });
  });

  it("maps a tracked ISS place", () => {
    assert.deepEqual(toPlace(ISS), {
      kind: "iss",
      code: "iss",
      name: "International Space Station",
      label: "International Space Station",
    });
  });

  it("rejects malformed places", () => {
    assert.throws(() => toPlace({ ...ISS, tracked_object: null }), /tracked_object/);
    assert.throws(() => toPlace({ ...CAPE, latitude: null }), /latitude/);
    assert.throws(() => toPlace({ ...CAPE, source: null }), /source/);
  });
});

describe("toMissionLegRecord", () => {
  it("maps the in-orbit leg: from the launch pad to the ISS, positioned at the ISS", () => {
    const r = toMissionLegRecord(MISSION, IN_ORBIT, CURRENT_POSITION.in_orbit);
    assert.deepEqual(r.mission, {
      id: MISSION.id,
      code: "demo-crew-12",
      name: "Mittus demo mission",
      reference: { label: "NASA SpaceX Crew-12 mission profile", url: "https://www.nasa.gov/mission/nasas-spacex-crew-12/" },
    });
    assert.equal(r.departure.place.kind, "fixed");
    assert.equal(r.departure.departedAt, "2026-02-13T10:15:56.000Z");
    assert.equal(r.departure.departedAtSource, "ll2");
    assert.equal(r.destination.place.kind, "iss");
    assert.equal(r.destination.description, IN_ORBIT.destination_description);
    assert.deepEqual(r.position, { kind: "iss" });
  });

  it("maps the return leg: from the ISS to a simulated splashdown, simulated without NORAD id", () => {
    const r = toMissionLegRecord(MISSION, RETURN, CURRENT_POSITION.return_to_earth);
    assert.equal(r.departure.place.kind, "iss");
    assert.equal(r.departure.departedAt, null);
    assert.equal(r.departure.departedAtSource, null);
    assert.deepEqual(r.destination.place, {
      kind: "fixed",
      code: "pacific_splashdown_california",
      name: "Earth",
      label: "Pacific splashdown zone off California",
      latitude: 32.6,
      longitude: -118.2,
      source: "manual",
      simulated: true,
      sourceUrl: null,
    });
    assert.deepEqual(r.position, {
      kind: "simulated",
      latitude: 31.2,
      longitude: -121.4,
      altitudeKm: 180,
      description: "Point on the descent toward a Pacific splashdown zone.",
    });
  });

  it("uses the craft's orbital elements in free flight when the NORAD id is known", () => {
    const r = toMissionLegRecord({ ...MISSION, norad_id: 100882 }, RETURN, CURRENT_POSITION.return_to_earth);
    assert.deepEqual(r.position, { kind: "spacecraft_tle", noradId: 100882 });
  });

  it("handles a mission without reference", () => {
    const r = toMissionLegRecord({ ...MISSION, reference_label: null, reference_url: null }, IN_ORBIT, CURRENT_POSITION.in_orbit);
    assert.equal(r.mission.reference, null);
  });
});
