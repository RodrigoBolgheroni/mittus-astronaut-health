# Mission registration — database and API

The mission registry stores each leg's departure and destination, not the craft's current position. Docked position comes from wheretheiss.at. In free flight, a registered `norad_id` selects CelesTrak orbital elements propagated with SGP4; without them, the configured simulated point is labeled explicitly. See the [position source contract](mission-context-backend.md).

Migration: [`supabase/migrations/20261114220000_create_missions.sql`](../supabase/migrations/20261114220000_create_missions.sql)

## Tables

| Table | Role | Main columns |
| --- | --- | --- |
| `missions` | Mission registry. | `code` (unique), `name`, `is_demo` (at most one), `ll2_launch_id`, `norad_id`, `reference_label`, `reference_url`. |
| `mission_legs` | One leg per API phase. Key: `(mission_id, phase)`. | `phase` (`in_orbit` \| `return_to_earth`), `departure_place_id`, `departure_at`, `departure_at_source`, `destination_place_id`, `destination_description`. |
| `mission_places` | Locations reusable across legs. The ISS is one phase's destination and the next phase's departure. | `code`, `name`, `label`, `kind`, `tracked_object`, `latitude`, `longitude`, `source`, `simulated`, `source_url`, `fetched_at`. |
| `session_missions` | Links a session (the `mittus_session` cookie) to a mission. `session_id` is the key: one mission per session. | `session_id`, `mission_id`. |

**Place types.** `tracked` is a moving object whose position is resolved live by the API (currently only `iss`). `fixed` is a coordinate, such as a launch pad or landing zone. A `CHECK` constraint enforces the shape: `tracked` requires `tracked_object` and has no coordinates or `source`; `fixed` requires latitude, longitude, and `source`.

**Sources.** `source` identifies the origin of a fixed coordinate: `ll2` (Launch Library 2), `mission_registration` (official announcement), or `manual`. `simulated = true` identifies data made up for the demo. `departure_at_source` does the same for the departure time and is required when a time is set.

**Access.** RLS is enabled on all four tables, with no policies and no privileges for `anon` or `authenticated`. Only the server reads them through `DATABASE_URL`.

## Demo mission

Based on NASA SpaceX Crew-12. Launch data comes from LL2, queried once ([launch `862b54e3…`](https://ll.thespacedevs.com/2.3.0/launches/862b54e3-7bf8-48e5-8cd1-d77257d5fde9/)).

| Phase | Departure | Destination |
| --- | --- | --- |
| `in_orbit` | Space Launch Complex 40, Cape Canaveral SFS (LL2), at 2026-02-13 10:15:56 UTC (LL2). | ISS (`tracked`). |
| `return_to_earth` | ISS (`tracked`), no departure time recorded. | Pacific landing zone off the California coast (`manual`, **simulated**). |

To replace the landing zone with the one announced by NASA, update `pacific_splashdown_california` with `source = 'mission_registration'`, `simulated = false`, and the announcement's `source_url`.

## How the route uses the registry

`GET /api/mission-context?phase=...` (in `web/`):

1. Validates the `mittus_session` cookie using the same `SESSION_SECRET` as the backend. Without a valid cookie, or if `SESSION_SECRET` is not configured in `web`, the session is treated as anonymous.
2. Looks up the phase's leg in the session's mission (`session_missions`) or, if there is no link, in the demo mission.
3. Resolves coordinates: `fixed` places use the values in the database; `tracked` places use the ISS's current position.
4. If the session's mission has no leg for that phase, returns `404 phase_not_in_mission`.
5. If `DATABASE_URL` is not configured or the database fails, uses the built-in demo mission in `web/src/lib/mission/mission-registry.ts` (same values as the migration) and returns `mission.registrySource = "built_in"`.

New response fields:

```json
{
  "mission": { "code": "demo-crew-12", "name": "Mittus demo mission", "registrySource": "database" },
  "departure": {
    "name": "Cape Canaveral",
    "departedAt": "2026-02-13T10:15:56.000Z",
    "departedAtSource": "ll2",
    "coordinates": {
      "latitude": 28.56194122, "longitude": -80.57735736, "asOf": null,
      "source": "ll2", "label": "Space Launch Complex 40, Cape Canaveral SFS, FL, USA",
      "sourceUrl": "https://ll.thespacedevs.com/2.3.0/launches/862b54e3-7bf8-48e5-8cd1-d77257d5fde9/"
    }
  }
}
```

`location`, `destination`, and `cabinTemperature` retain the previous format. `destination.coordinates.source` now also accepts `ll2` and `manual`, and `missionReference` may be `null`.

## `web` configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Same connection as the backend. Optional: without it, the route uses the built-in demo mission. |
| `SESSION_SECRET` | Same value as the backend, used to read the session cookie. Optional: without it, every request uses the demo mission. |

Both server runtimes must use the same `SESSION_SECRET` and database. The backend remains the only cookie issuer. Because its cookie is host-only, production routing must expose the backend session endpoints and the Next.js mission route on the same hostname (for example through a reverse proxy); sharing only a parent site does not share a host-only cookie. Localhost ports can differ. Without the shared cookie or secret, the web route intentionally shows the demo mission rather than a session-specific one.

Passwords containing special characters (`@`, `#`, `/`, `%`) must be URL-encoded (`@` → `%40`, `#` → `%23`).

## Out of scope

- **Backend Prisma.** The shared schema now maps `Mission`, `MissionPlace`, `MissionLeg` and `SessionMission`, alongside check-ins/actions. The mission-context endpoint remains in Next.js and uses its existing `pg` reader; do not create a duplicate NestJS route. Use the [canonical SQL history and replay guidance](../backend/README.md#database-schema-synchronization), not `prisma db push` or a reset against the shared Supabase project. The partial demo-mission unique index, CHECK constraints and RLS remain SQL-owned.
- **Session linking.** `POST /api/missions` now creates an ordinary mission, both legs and its `session_missions` link atomically. A valid shared signed session and JSON are required; browser Origin must match trusted configuration. Public callers cannot change the global demo mission.
