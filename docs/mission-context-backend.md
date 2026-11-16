# Mission context: spacecraft position and external sources

The **Mission Context** card shows where a leg starts, where the spacecraft is now, and where it is headed. The database, tables, session, and demo mission are described in [Mission registration — database and API](missions-database.md). This document covers **position**, which is never stored: the route looks it up on request.

## Position sources

| Location | Source | Cache |
| --- | --- | --- |
| **ISS** (`tracked` place, departure, or destination) | `GET https://api.wheretheiss.at/v1/satellites/25544`, calculated from the ISS TLE (NORAD) | 5 seconds per instance |
| **Docked spacecraft** (`in_orbit`) | Same position as the ISS | 5 seconds |
| **Spacecraft returning to Earth** (`return_to_earth`) | If `missions.norad_id` is set, the spacecraft's orbital elements are fetched from `GET https://celestrak.org/NORAD/elements/gp.php?CATNR={norad}&FORMAT=json` and propagated with SGP4 (`satellite.js`). Otherwise, the configured simulated point is used. | Elements cached for 2 hours; position recalculated on each request |
| **`fixed` places** (launch pad, splashdown) | As stored in `mission_places` | — |

The `demo-crew-12` mission has no `norad_id`, so its return leg uses the simulated point (`31.2, -121.4`, 180 km). Positions are **calculated** from public data, with accuracy of a few kilometers. Onboard telemetry is not public, and the card must always show `label` and `asOf`.

## Per-phase configuration (`web/src/lib/mission/mission-config.ts`)

| Phase | `position.kind` | Behavior |
| --- | --- | --- |
| `in_orbit` | `iss_live` | The spacecraft position is the ISS position. |
| `return_to_earth` | `tle_or_simulated` | Use the CelesTrak TLE if the mission has a `norad_id`. Without one, or if CelesTrak fails, use the simulated point stored in the config. |

## Failures

External-source failures do not cause the route to fail:

- **wheretheiss.at unavailable or returns `429`:** the route returns the last good position, with its original `asOf`, and waits 30 seconds before retrying. If no good position exists, it uses the snapshot at `web/src/data/iss-position-snapshot.json`, with `source: "wheretheiss_snapshot"`.
- **CelesTrak unavailable:** the route continues using the latest downloaded elements while they are less than 3 days old, and retries every 10 minutes. If there are no elements, it uses the simulated point and logs a warning.
- **Database unavailable:** the route uses the built-in demo mission (see [missions-database.md](missions-database.md)).

## Position field contract

- **`location.source`:** `wheretheiss`, `wheretheiss_snapshot`, `celestrak_tle`, or `simulated`.
- **`departure.coordinates.source` and `destination.coordinates.source`:** `wheretheiss` or `wheretheiss_snapshot` for the ISS; `ll2`, `mission_registration`, or `manual` for fixed points; `simulated` for generated points.
- **`sourceUrl`:** the wheretheiss.at URL, the CelesTrak URL with the NORAD ID, or the fixed location's source URL.

Previously, the ISS sources were `nasa_iss_oem` and `nasa_iss_oem_snapshot`. The NASA OEM file and its parser have been removed.

Example `location` in `in_orbit`:

```json
{
  "latitude": 18.86, "longitude": -107.319, "altitudeKm": 413.8,
  "asOf": "2026-11-14T22:51:32.000Z",
  "source": "wheretheiss", "label": "Live ISS position from wheretheiss.at",
  "sourceUrl": "https://api.wheretheiss.at/v1/satellites/25544"
}
```

With `norad_id = 100882` (Crew Dragon from Crew-13, currently docked), the return position came back with `source: "celestrak_tle"` and is within a few kilometers of the ISS, as expected for a docked spacecraft.

## Code

| File | Purpose |
| --- | --- |
| `web/src/lib/mission/wheretheiss.ts` | Validates the API response and reads the ISS position (5-second cache, 5-second timeout, fallback). |
| `web/src/lib/mission/celestrak.ts` | Downloads the spacecraft OMM and calculates its position with SGP4. Rejects elements older than 3 days. |
| `web/src/lib/mission/cached-source.ts` | In-memory cache with deduplication, backoff after failures, and last known good position. |
| `web/src/lib/mission/live-position.ts` | Shared instances of both readers. |
| `web/src/lib/mission/mission-context.ts` | Selects the position source by phase and builds the response. |
| `web/src/lib/mission/mission-registry.ts`, `mission-store.ts` | Read `missions.norad_id` together with the mission leg. |

**New dependency:** `satellite.js@7.1.0`. **Network:** the server needs outbound HTTPS access to `api.wheretheiss.at` and `celestrak.org`. No new environment variables are required.

## Submission (NASA Data field)

Positions come from NORAD data (wheretheiss.at and CelesTrak), and the launch location comes from Launch Library 2, a community catalog. These sources **do not count as NASA data** and must be cited under **Space Agency Partner Data and Other References**.

NASA references include Human Research Program sleep/fatigue research, the Crew-12 profile and the historical cabin sample in `web/src/data/iss-cabin-temperature.json`: RR-1 (SpaceX-4), 22.8 °C at 2014-10-01 00:00:00 GMT. The value is `temperature_iss` in the [official RR-1 telemetry response](https://visualization.osdr.nasa.gov/eda/dashboard_RR-1); NASA Data Tables identifies its columns as `Temp_degC_ISS` and `Controller_Time_GMT`. GMT is stored as UTC. This is a historical 2014 sample, never a live cabin reading.

## How to test

```bash
cd web
npm test        # wheretheiss, CelesTrak/SGP4, cache, registration, session, and distance
npx tsc --noEmit -p . && npx eslint src && npx next build
npm run dev     # without DATABASE_URL, the route uses the built-in demo mission
curl "http://localhost:3000/api/mission-context?phase=in_orbit"         # location.source: "wheretheiss"
curl "http://localhost:3000/api/mission-context?phase=return_to_earth"  # location.source: "simulated"
```
