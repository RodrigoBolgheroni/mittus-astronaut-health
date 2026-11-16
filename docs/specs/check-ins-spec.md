# SPEC — Initial check-in implementation

**Status:** API implemented and verified; contract available for frontend integration.
**Scope:** Check-in API in the NestJS backend, persistence through Prisma/PostgreSQL, and a contract for calendar integration.
**References:** [Prisma schema](../../backend/prisma/schema.prisma), [data specification](../check-ins-database.md), and [MVP features](../../FEATURES.md).

## 1. Purpose

Allow a demo astronaut to record sleep, stress, mood, team conflict, and fatigue; correct that day's record; and query history by session. The record must remain available after the page reloads.

The first integrated flow will be:

1. Query the calendar and establish the demo session.
2. Complete that day's check-in.
3. Save the record through the API.
4. Query the calendar again and display the saved record.
5. Reload the page and restore the same data for the session.

API field names, API messages, and text shown in the app must be in English. Project documentation is also maintained in English.

## 2. Existing system and decisions

### Confirmed

- The database is PostgreSQL on Supabase; the backend accesses it with server credentials.
- The `CheckIn` model is mapped to `check_ins`.
- There is at most one check-in per `(session_id, check_in_date)`.
- Sleep and the four scales are required; `description` is optional.
- The scale option tables already exist and are referenced by foreign keys.
- `check_in_actions` is now processed by the same backend; see the [implemented action contracts](../../backend/README.md#check-in-actions).

### Confirmed decisions for this first version

The following five proposals were approved and must guide implementation:

| Topic | Decision |
| --- | --- |
| Reference day | UTC; the backend is authoritative for determining the current date. |
| Writes | Create or replace only the current day's check-in. |
| History | Previous records can be queried; past and future dates cannot be written in this version. |
| Description | Optional free text, up to 2,000 characters after trimming whitespace from both ends. |
| Session | Anonymous demo session using a signed cookie, with a fixed 30-day lifetime. |

The 0–24 hour sleep range and the scales below are already enforced by the database. Changing the date rule in the future will not require changing the column types.

## 3. Data and validation

API fields use `snake_case`; Prisma fields use `camelCase` and `@map` for the corresponding columns.

| API field | Prisma field | Rule |
| --- | --- | --- |
| `sleep_hours` | `sleepHours` | Finite number from 0 to 24, with at most two decimal places. |
| `stress_level` | `stressLevel` | Integer from 1 to 5: `Very calm` → `Very stressed`. |
| `mood_level` | `moodLevel` | Integer from 1 to 5: `Very happy / positive` → `Very sad / negative`. |
| `team_conflict_level` | `teamConflictLevel` | Integer from 1 to 5; use the labels stored in the options table. |
| `fatigue` | `fatigue` | Integer from 1 to 7: `Fully alert and wide awake` → `Completely exhausted and unable to function effectively`. |
| `description` | `description` | String or `null`; omitted, `null`, or whitespace-only text after trimming results in `null`. |

Additional rules:

- Reject unknown fields, including `session_id`, `id`, `created_at`, and `updated_at` in the write body.
- Reject numeric strings, booleans, arrays, and objects where a number is expected. Do not silently convert `"3"` to `3`.
- Every indicator must be present in each `PUT`. Do not implement partial updates.
- Dates must use `YYYY-MM-DD` and be valid calendar dates; for example, reject `2026-02-30`.
- Treat `check_in_date` as a date without a time. Use a consistent UTC conversion at the Prisma boundary, without shifting by the process timezone.
- Serialize `sleep_hours` as a JSON number, even if Prisma represents it as `Decimal`.
- Serialize `created_at` and `updated_at` as ISO 8601 UTC instants.

**Conflict labels — confirmed:** Keep the labels stored in the database. The API must return them rather than introducing a divergent list:

| Value | Label |
| 1 | No team conflict |
| 2 | Low team conflict |
| 3 | Moderate team conflict |
| 4 | High team conflict |
| 5 | Very high team conflict |

## 4. Demo session

- Cookie: `mittus_session`, containing a server-generated UUID and a verifiable signature.
- The server creates a session when the cookie is missing, invalid, or expired. A new session starts with no history.
- The same cookie is used for all three check-in routes and the options route.
- Use `HttpOnly`, `Path=/`, `SameSite=Lax`, `Max-Age=2592000`, and `Secure` in production. The signature must include the expiration and use a server-only secret.
- Do not accept an arbitrary UUID supplied by the client as a valid session. Do not return the session identifier in JSON.
- Every query must filter by `sessionId`. Every write must obtain this value exclusively from the validated session.
- Deleting or expiring the cookie ends access to that history; cross-device recovery is outside the anonymous flow.
- Check-in responses must use `Cache-Control: private, no-store`.

For web integration, the client must send `credentials: 'include'`. If origins differ, the backend must explicitly allow the configured origin and enable credentials; it must not use `*`. The proposed deployment uses the frontend and API on the same site for compatibility with `SameSite=Lax`. A cross-site deployment requires reviewing cookies and CSRF protection before integration.

Write requests originating in a browser must validate `Origin` against the allowed web origin; CORS alone does not replace this check. Cookies, signatures, and connection URLs must not appear in logs.

## 5. HTTP contract

Global prefix: `/api`.

### 5.1 Create or replace a check-in

`PUT /api/check-ins/:date`

```json
{
  "sleep_hours": 7.5,
  "stress_level": 2,
  "mood_level": 1,
  "team_conflict_level": 1,
  "fatigue": 3,
  "description": "Slept well and feel ready for the day."
}
```

Response: **200 OK**, both when creating and replacing a record, with the complete record:

```json
{
  "id": "e14510ab-9d7f-4dc3-b166-10e77900ce21",
  "check_in_date": "2026-11-14",
  "sleep_hours": 7.5,
  "stress_level": 2,
  "mood_level": 1,
  "team_conflict_level": 1,
  "fatigue": 3,
  "description": "Slept well and feel ready for the day.",
  "created_at": "2026-11-14T12:00:00.000Z",
  "updated_at": "2026-11-14T12:00:00.000Z"
}
```

- Examples use a fictional date; the write rule compares the submitted date with the backend's current date.
- Persist with `upsert` using the `sessionId_checkInDate` compound key.
- On update, preserve `id` and `created_at`; Prisma updates `updated_at` through `@updatedAt`.
- Omitting `description` in a new `PUT` clears the previous description because the operation replaces the complete record.
- Repeated writes do not create duplicates. Concurrent writes for the same session/date must result in one record through the atomic `upsert`. The last written content wins. Do not interpret Prisma/PostgreSQL error codes or implement retries based on those codes.

### 5.2 Query a date

`GET /api/check-ins/:date`

- **200 OK:** same format as the record returned by `PUT`.
- **404 Not Found:** no check-in exists for this date in the current session.
- Past, current, and future dates may be queried; a valid date with no record returns 404.

### 5.3 Query history or a calendar range

`GET /api/check-ins`

The endpoint supports two mutually exclusive modes:

| Mode | Example | Behavior |
| --- | --- | --- |
| Recent history | `?limit=7` | Returns the most recent records in descending date order. Default: 7; minimum: 1; maximum: 90. |
| Calendar | `?from=2026-11-01&to=2026-12-01` | Returns the `[from, to)` range in ascending date order. Both dates are required; `from < to`; maximum: 366 days. |

Reject `limit` combined with `from` or `to`, non-integer limits, unknown parameters, and incomplete ranges. The exclusive end must also be preserved in the frontend contract.

Response: **200 OK**.

```json
{
  "items": [],
  "today": "2026-11-14",
  "timezone": "UTC"
}
```

When data exists, each item has the complete record format defined above. `today` and `timezone` let the frontend highlight the correct date without relying on the local clock. Missing days do not produce artificial records; an empty list is a successful response.

### 5.4 Read scale options

`GET /api/check-in-options`

Response: **200 OK**, with values read from the four option tables and sorted by `value`:

```json
{
  "stress_level": [
    { "value": 1, "label": "Very calm" },
    { "value": 2, "label": "Calm" },
    { "value": 3, "label": "Moderate" },
    { "value": 4, "label": "Stressed" },
    { "value": 5, "label": "Very stressed" }
  ],
  "mood_level": [],
  "team_conflict_level": [],
  "fatigue": []
}
```

The example abbreviates three lists; in the implementation, they must contain every stored value: five for each mood/stress dimension and seven for fatigue.

## 6. Errors

Application-defined validation and business errors use English messages and the following format:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid check-in data.",
  "details": [
    { "field": "fatigue", "message": "Must be an integer between 1 and 7." }
  ]
}
```

| HTTP | `code` | Situation |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid body, date, or query, validated with `class-validator`. |
| 403 | `ORIGIN_NOT_ALLOWED` | Browser origin is not authorized for writes. |
| 404 | `CHECK_IN_NOT_FOUND` | Individual query finds no record in the current session. |
| 422 | `CHECK_IN_DATE_NOT_WRITABLE` | Attempt to write outside the current UTC date. |

Do not use a custom exception filter or classify failures by Prisma/PostgreSQL error codes. Existence checks must query the database and inspect the result; for example, look up a check-in by session/date and return 404 when the result is `null`.

Malformed JSON and unexpected exceptions are handled by NestJS's default mechanism. Unexpected failures return HTTP 500 with `{ "statusCode": 500, "message": "Internal server error" }`, without SQL, credentials, or stack traces in the response.

## 7. Technical organization

Suggested structure, consistent with the project's NestJS and TypeScript ESM setup:

```text
backend/
  src/
    prisma/
      prisma.module.ts
      prisma.service.ts
    session/
      session.module.ts
      session.middleware.ts
    check-ins/
      check-ins.module.ts
      check-ins.controller.ts
      check-in-options.controller.ts
      check-ins.service.ts
      dto/
        check-in-date.input.ts
        put-check-in.input.ts
        list-check-ins.input.ts
        check-in.output.ts
        list-check-ins.output.ts
        check-in-options.output.ts
      requests/
        put-check-in.request.ts
      query-params/
        list-check-ins.query-params.ts
        check-in-date-range.validator.ts
      path-params/
        check-in.path-params.ts
      check-in.presenter.ts
  test/
    check-ins.e2e-spec.ts
```

- Configure the `/api` prefix, validation, and CORS while retaining NestJS's default exception handling.
- Use interfaces without validation in `dto/`, with `.input.ts` and `.output.ts` files, for service contracts. Validate bodies, queries, and paths with `class-validator` in `requests/`, `query-params/`, and `path-params/` classes, respectively. Apply `ValidationPipe` and use `class-transformer` only to convert the query limit and normalize the description. Convert dates for Prisma in the service, without manual validation parsers.
- Use a shared `PrismaService` instance and close its connection properly.
- Install and pin compatible Prisma CLI and client versions. The current schema uses `url = env("DATABASE_URL")`, a format validated with Prisma 6; a major-version upgrade requires the corresponding configuration change.
- Standardize the connection on `DATABASE_URL`, as required by the Prisma datasource. If the environment still uses `DATASOURCE_URL`, align the name during setup without exposing its value.
- Configure `SESSION_SECRET`, `WEB_ORIGIN`, `PORT`, and the runtime environment on the server. Load configuration before instantiating Prisma.
- Use the appropriate pooler for application execution; migration/diff commands should use a direct connection or session-mode pooler, depending on network availability.
- No new table is required for this scope. Preserve the existing SQL range constraints, foreign keys, and RLS.
- Access is exclusively through the backend. Existing RLS does not identify demo sessions; the backend must explicitly enforce session isolation in every operation.
- The canonical SQL history is `supabase/migrations`. Isolated tests replay those files instead of using `db push`; the recovered baseline and original mission migration are described in the [database synchronization guidance](../../backend/README.md#database-schema-synchronization). The existing Supabase project is not reset or migrated by test setup.

## 8. Acceptance criteria and tests

- [x] The first request sets a cookie; subsequent requests reuse the session.
- [x] A tampered or expired cookie starts a new session and does not restore the previous history.
- [x] Saving a valid check-in returns every field in the specified format.
- [x] Repeating a write for the same session/date keeps one record, preserves `id` and `created_at`, and updates the indicators.
- [x] Concurrent writes do not create duplicates or produce unhandled conflict errors.
- [x] `description` is normalized and cleared when omitted from a replacement.
- [x] Valid boundary values are accepted; out-of-range values, fractions on scales, numeric strings, unknown fields, and missing indicators are rejected.
- [x] Invalid dates and queries are rejected.
- [x] With a controlled clock, writes for past/future dates are rejected; the current date is calculated in UTC even near midnight.
- [x] Recent history respects its limit and sort order; the calendar includes `from` and excludes `to`.
- [x] Session B cannot read or modify session A's records, including when querying the same date.
- [ ] Reloading the client preserves data while the cookie remains valid.
- [x] Options return 5/5/5/7 sorted values, with English labels from the database.
- [x] Database errors return sanitized responses; writes from unauthorized origins are rejected.
- [x] Relevant build, lint, and tests pass.

Use Vitest/Supertest for HTTP and cookie tests. Persistence tests must run against an isolated test database and prove upsert behavior, concurrency, and session isolation; mocks alone do not prove these properties. Also run the [existing SQL tests](../../backend/test/database/check-ins.sql) to verify constraints. Do not delete records from other sessions during test cleanup.

Implementation and run commands: [backend README](../../backend/README.md). Automated verification covers the API with local PostgreSQL and cookie reuse across requests; browser validation of the interface is part of frontend integration.

## 9. Implementation sequence

1. Configure Prisma, the database connection, and environment variables; generate the client.
2. Implement sessions and configuration validation.
3. Implement validation, upsert writes, serialization, and individual-record queries.
4. Implement listing by limit/range and option reads.
5. Standardize errors and run the acceptance tests.
6. Integrate the frontend: load options and the calendar, send `PUT`, and refetch after success.
This specification covers the daily check-in API. Check-in actions are also implemented; see the [backend action contract](../../backend/README.md#check-in-actions) for evaluation, history and status updates. Actions now consume the shared trained synthetic fatigue model locally; language-model insights remain a separate integration.
