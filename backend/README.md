# Mittus — Backend

NestJS API for daily check-ins, using Prisma 6 and PostgreSQL/Supabase.

## Setup

Requirements: Node.js 24 and pnpm 10. Run the commands below from `backend/`.

```bash
pnpm install
pnpm prisma:generate
```

Configure `.env` using [`.env.example`](.env.example) as a reference, preserving your existing credentials:

| Variable         | Usage                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL server connection. The application also accepts the legacy name `DATASOURCE_URL` if `DATABASE_URL` is absent. Prisma commands use `DATABASE_URL`. |
| `SESSION_SECRET` | Random secret with at least 32 characters for signing cookies. It must remain stable across restarts and be identical across all API instances.           |
| `WEB_ORIGIN`     | Exact frontend origin, such as `http://localhost:3000`, with no trailing slash.                                                                              |
| `PORT`           | API port; defaults to `3001`.                                                                                                                                           |
| `NODE_ENV`       | `production` enables the cookie's `Secure` attribute; use HTTPS in this environment.                                                                                   |
| `FATIGUE_FORECAST_URL` | Optional trusted HTTP provider override. When unset, actions use the bundled synthetic fatigue model locally. |
| `CERES_URL` | Optional server-only base URL for Ceres. Unset/unavailable uses the explicitly labeled persisted basic summary; never a fabricated prediction. |

To generate a local secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The existing Supabase database is already provisioned. Starting the API does not apply migrations. Do not run `db push` or reset the shared database; use the [canonical SQL history](#database-schema-synchronization) for schema reconstruction.

```bash
pnpm start:dev
```

Production:

```bash
pnpm build
pnpm start:prod
```

The build generates the client and copies the Prisma engine to `dist`. You do not need to commit `src/generated` to Git.

## Endpoints

| Method | Route                                          | Purpose                                                              |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------- |
| `PUT`  | `/api/check-ins/:date`                         | Creates or replaces the current UTC day's record.                    |
| `GET`  | `/api/check-ins/:date`                         | Retrieves a session date; returns 404 if it does not exist.          |
| `GET`  | `/api/check-ins?limit=7`                       | Recent history, in descending date order; limit between 1 and 90.  |
| `GET`  | `/api/check-ins?from=2026-11-01&to=2026-12-01` | Calendar with inclusive start and exclusive end; maximum of 366 days. |
| `GET`  | `/api/check-in-options`                        | Values and labels for the four scales, read from the database.    |
| `POST` | `/api/check-ins/:checkInId/actions/evaluate` | Generates or reuses the latest owned persisted insight and complete task checklist. |
| `GET` | `/api/check-ins/:checkInId/actions` | Lists up to 90 actions, newest first, for an owned check-in. |
| `PATCH` | `/api/check-in-actions/:actionId` | Acknowledges, completes or dismisses an owned pending action. |

Full contract: [Check-ins specification](../docs/specs/check-ins-spec.md).

Example `PUT` body:

```json
{
  "sleep_hours": 7.5,
  "stress_level": 2,
  "mood_level": 1,
  "team_conflict_level": 1,
  "fatigue": 3,
  "description": "Feeling ready for the day."
}
```

`PUT` returns 200 for both creation and replacement. Omitting `description` removes the previous text. Unknown fields and numeric strings are rejected.

### Validation organization

In `src/check-ins/`, service contracts are interfaces without validation, in `dto/`, with `.input.ts` and `.output.ts` suffixes. Classes with `class-validator` decorators are in `requests/` (body), `query-params/` (query), and `path-params/` (route). The `ValidationPipe` applies these validations to HTTP input; `class-transformer` converts the query limit and normalizes the description.

Existence checks query the database and evaluate the result. There is no custom exception filter or handling based on Prisma/PostgreSQL codes. Unexpected exceptions use NestJS's default HTTP 500 response.

## Check-in actions

The NestJS backend owns canonical history, generation, persistence and task states. Browsers supply only the check-in ID and send credentials. The existing Origin check protects write routes. Missing or foreign IDs return `404`; invalid UUIDs, nonempty evaluation bodies and invalid status updates return `400`.

### Forecast integration

Eres uses the shared `@mittus/fatigue-model` package by default with the complete chronological session history. Its native `ok` becomes `ready`. Fewer than three records produce `insufficient_history`: no probability or forecast-sourced task is invented, but a recorded-value summary and check-in-based review task remain available.

Both runtime packages depend on `file:../ml`. Include that folder when installing from a monorepo checkout; the installed model package contains JavaScript, type declarations and the weight artifact, so the compiled backend does not import TypeScript from the web source tree. `ml/train.py` exports to `ml/fatigue-model.json`. Inference, weights and training output have a single owner; there is no compatibility copy under `web/src/lib`.

Set `FATIGUE_FORECAST_URL` only to override the bundled model with a trusted HTTP provider. The server posts `{ "check_ins": [...] }` with the complete chronological history. Each entry contains `id`, `check_in_date`, `sleep_hours`, `stress_level`, `mood_level`, `team_conflict_level` and `fatigue`. Session identifiers, cookies and free-text descriptions are not sent. Provider failures do not silently switch model versions by falling back locally.

The provider must return HTTP 200 with one of these JSON responses:

```json
{
  "status": "ready",
  "probability_high_fatigue": 0.7,
  "model_version": "your-versioned-model",
  "predicted_at": "2026-11-14T12:00:00.000Z"
}
```

```json
{ "status": "insufficient_history" }
```

HTTP forecast output must contain a finite probability between 0 and 1, a nonempty model version (maximum 128 characters), and a valid UTC ISO prediction instant ending in `Z`. HTTP failure, malformed output or a five-second timeout produces `unavailable`. Older pending tasks and the current insight are superseded when the accepted evaluation changes; completed/dismissed history and original snapshots remain intact.

### Evaluation and state

Call `POST /api/check-ins/{id}/actions/evaluate` with no body or `{}`. Only the latest owned check-in is evaluable (`409 CHECK_IN_NOT_LATEST` otherwise). The response is `{ status, forecast, insight, actions }`: `status` describes forecast availability; `insight` is the persisted recommendation and `actions` contains every task in that evaluation, including its saved progress. There is no singular `action` compatibility field.

The server calls the separately deployed Ceres service through optional server-only `CERES_URL`, posting only canonical numeric check-in fields and the Eres result to `/v1/recommendations`. Descriptions, cookies and session IDs are never sent. Output is validated against task keys, enums, generator provenance and forecast availability; provider-supplied statuses/snapshots are ignored. Calls have a 60-second timeout, no redirects and no automatic retries. Missing, invalid or unavailable Ceres produces a persisted deterministic `source: fallback` summary and review task, plus the existing `demo-follow-up-v1` monitor/recheck task only when Eres is ready. This is not medical advice.

The training script's evaluation threshold is for its synthetic classification report; it does not change the versioned action display threshold above.

The evaluation identity covers canonical history, forecast status/model/probability, generation policy and configured provider. Prediction timestamps alone never change it. Repeated evaluation reuses insight/task IDs and progress without calling Ceres again; overlapping in-process requests are coalesced. SQL session locks and unique keys prevent duplicate persistence across instances. A superseded evaluation is never revived. Persisted fallback is also reused; reloading is not a promise of another paid generation.

Network calls run outside SQL transactions. Before publishing, the server locks the session and rechecks the complete history fingerprint (`409 EVALUATION_OUTDATED` if changed). The insight and all tasks are saved in one transaction. Numeric corrections and new-day entries immediately supersede current insights and pending tasks across the session. Description-only and identical saves preserve the existing evaluation.

Send `{ "status": "acknowledged" }`, `{ "status": "completed" }` or `{ "status": "dismissed" }` to the PATCH route. Suggested actions may be acknowledged or resolved directly; acknowledged actions may be completed/dismissed. Repeating the current status is idempotent. Other changes to completed, dismissed or superseded actions return `409 ACTION_NOT_PENDING`. Timestamps are set by the server and remain monotonic; clients cannot choose them.

GET returns `{ actions: [...] }`, including historical statuses, newest first (up to 90). Each task exposes its ID, check-in/evaluation IDs, `task_key`, `title`, `source`, `kind`, action/reason/ruleset codes, nullable canonical forecast snapshot, status and timestamps. The insight includes its ID, title, summary, `next_step`, facts, source/generator and supersession timestamps. Session IDs are never exposed.

## Frontend integration

The server issues the signed `mittus_session` cookie, with a fixed 30-day lifetime. The frontend does not need to read or store its value. Always send credentials:

```ts
const API_URL = 'http://localhost:3001';

// Establish the session before sending other requests in parallel.
const response = await fetch(`${API_URL}/api/check-ins?limit=7`, {
  credentials: 'include',
});
if (!response.ok) throw new Error('Could not load check-ins.');
const { items, today, timezone } = await response.json();

// Use `today` returned by the backend; do not derive the date from the local clock.
const saved = await fetch(`${API_URL}/api/check-ins/${today}`, {
  method: 'PUT',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sleep_hours: 7.5,
    stress_level: 2,
    mood_level: 1,
    team_conflict_level: 1,
    fatigue: 3,
  }),
});
if (!saved.ok) throw new Error('Could not save check-in.');
// After saving, refetch the calendar's visible date range.
```

Set `WEB_ORIGIN` to the interface's actual origin. Cookies use `SameSite=Lax`; the frontend and API must be on the same site. Responses are not stored in a shared cache, and queries always use the session validated by the backend.

## Checks

```bash
pnpm test
pnpm lint
pnpm build
```

### Isolated PostgreSQL integration

HTTP and schema tests require a local PostgreSQL database named `mittus_test`, selected through `TEST_DATABASE_URL`. On its first run, the setup requires an empty public schema and replays the actual versioned SQL migrations, including lookup labels and the demo mission. It refuses to drop existing tables. Cleanup removes only records created by the tests.

Example of a local database with Docker (create the container once):

```bash
docker run --name mittus-check-ins-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mittus_test -p 127.0.0.1:55439:5432 -d postgres:17
```

After PostgreSQL is ready:

```bash
TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55439/mittus_test' pnpm test:e2e
psql 'postgresql://postgres:postgres@127.0.0.1:55439/mittus_test' -v ON_ERROR_STOP=1 -f test/database/check-ins.sql
```

The setup emulates Supabase roles locally, then applies SQL files from `supabase/migrations` in filename order. Each file and its SHA-256 checksum are recorded atomically in the test-only `mittus_test_meta.migrations` table. Repeated runs preserve existing rows and skip unchanged files; changing an applied file requires a fresh isolated database. No `db push` or duplicate hand-maintained CHECK definitions are used.

Tests cover saving/replacing, concurrency, session isolation, tampered and expired cookies, UTC, calendar, validation, CORS, and NestJS's default response to unexpected failures.

Action coverage includes real PostgreSQL persistence, concurrent retries, cross-session access, stale inference, immediate invalidation after edits, recovery from predictor failure, status conflicts, snapshot preservation and description-only changes. Forecast/config unit tests cover invalid probabilities/timestamps, network failure and timeout handling.

## Database schema synchronization

The authoritative SQL history is [`supabase/migrations`](../supabase/migrations):

| Migration | Purpose |
| --- | --- |
| `20261114000000_baseline_check_ins.sql` | Recovered baseline for the previously untracked check-in and option tables, including `description`, constraints, foreign keys, labels, grants and RLS. |
| `20261114192439_create_check_in_actions.sql` | Existing action table and integrity rules; unchanged. |
| `20261114220000_create_missions.sql` | Original SQL recovered from Supabase migration history, including mission tables, indices, access rules and demo seed data. |
| `20261116000000_persist_check_in_plans.sql` | Reconstructs the observed task metadata, per-task uniqueness, nullable snapshots and insights table while preserving existing action content/statuses. |
| `20261116010000_persist_insight_next_step.sql` | Adds the missing required `next_step` field. Refuses a populated pre-column insights table rather than inventing generated content. |

Prisma maps all eleven public tables, including `CheckInInsight` and the four mission models. Partial unique current-insight and single-demo indices remain SQL-only. Do not replace them with full-column Prisma unique constraints.

The Next.js `GET /api/mission-context` route now reads the registered mission using its existing `pg` reader. It shares `DATABASE_URL`, `SESSION_SECRET` and the host-visible `mittus_session` cookie with this backend; proxy both API surfaces through the same hostname in production. This backend continues to own check-ins/actions and cookie issuance, without a duplicate mission route or a mandatory mission link on check-ins. Option-table grants match the inspected database; RLS without public policies still filters those tables for public API roles. Health and mission tables remain server-only.

**Existing Supabase project:** both recovered migration outputs already exist there. The recovered baseline version is not an entry in the remote migration history, and must not be blindly applied or automatically marked as applied. No remote history repair, schema write or seed replay is performed by this synchronization. Reconcile that baseline explicitly before any future Supabase CLI deployment; starting the API requires no such operation.

**Persisted-plan rollout:** the remote task/insight evolution was observed without a corresponding new migration-history entry. The first new migration reconstructs that evolution for fresh replay; do not run it blindly against already-existing remote objects. Reconcile history deliberately, then apply the separate next-step migration before deploying this backend. No remote migration/history update was performed in this implementation. Back up existing records and stop incompatible writers during the coordinated cutover.

**Fresh local database:** run the existing `test:e2e` command against an empty, isolated `mittus_test` database with an administrative local test user. The setup creates only missing local test roles and verifies the real SQL history through API and schema tests. It never resets a populated database or targets Supabase.
