# Mittus MVP Features

Mittus is an English-language web app for logging health indicators, monitoring fatigue, and viewing mission context. The demo uses a fictional astronaut and simulated health data.

## Database

**Supabase PostgreSQL · `mittus` project.** Project Ref `ynxlbpmhdfaofcyamejf`. [Mittus project dashboard](https://supabase.com/dashboard/project/ynxlbpmhdfaofcyamejf)

- **`public.check_ins`** stores `id`, `session_id`, `check_in_date`, `sleep_hours`, `fatigue`, `mood_level`, `stress_level`, `team_conflict_level`, `description`, `created_at` and `updated_at`. The implemented API requires all numeric indicators; `description` is optional. There is one record per session and UTC date.
- **`public.check_in_actions`** stores `id`, `check_in_id`, `evaluation_key`, `action_code`, `reason_code`, `ruleset_version`, `forecast_snapshot`, `status`, `created_at`, `acknowledged_at`, and `resolved_at`. Each action points to the check-in that prompted the evaluation. [SQL migration](supabase/migrations/20261114192439_create_check_in_actions.sql)

- **Mission registry** stores the departure and destination of each leg, not the craft's live position. [Model and decisions](docs/missions-database.md) · [SQL migration](supabase/migrations/20261114220000_create_missions.sql)
  - **`public.missions`** — mission identity, demo selection, launch identifiers and references.
  - **`public.mission_legs`** — one leg per phase, with departure place/time/source and destination place/description.
  - **`public.mission_places`** — reusable tracked objects or fixed coordinates with provenance and simulation flags.
  - **`public.session_missions`** — an optional mission link per signed demo session; unlinked sessions use the demo mission.

The server validates the session cookie and reads the database using `DATABASE_URL`. Action operations check `check_ins.session_id` through `check_in_id`; the mission-context route resolves `session_missions` using the same signed session. RLS is enabled and public API role grants are revoked on action and mission tables.

## Features and dependencies

The NestJS backend owns canonical history, Eres integration, Ceres generation and persisted recommendations/tasks. Evaluation returns `{ status, forecast, insight, actions }`; forecast availability is independent from check-in-based tasks. Ceres failure uses an explicitly labeled persisted basic summary, not a fabricated prediction. [Backend contract](backend/README.md#check-in-actions)

| Feature | What the astronaut does | API and dependencies | Table |
| --- | --- | --- | --- |
| **Daily check-in** | Rates stress, mood, team conflict, and fatigue using Lucide icons on the scales. The fatigue step includes sleep and **Other hours** for entering a custom value. The optional description comes before review. The confirmation shows **Back to home** and **Edit this check-in** side by side. | `PUT /api/check-ins/{date}` accepts `sleep_hours`, `fatigue`, `mood_level`, `stress_level`, `team_conflict_level`, and optional `description`. **Other hours** uses `sleep_hours`, from 0 to 24 with up to two decimal places. | Writes to `check_ins`. |
| **Home, 3D body, and history** | Opens the checklist from Home, checks the discomfort recommendation for the selected body area, and views sleep and fatigue charts in history. | `GET /api/check-ins?limit=7` loads history. The body hotspot helps record discomfort in the check-in description. Use the API contract's 1–7 fatigue scale when displaying real API data. | Reads `check_ins`. |
| **Experimental fatigue forecast — Eres** | Sees the chance of reporting high fatigue at the next check-in in the forecast card below the AI recommendation. | Check-in Actions calls `predictFatigue` from the `@mittus/fatigue-model` package with the complete chronological history. Fewer than three records result in `insufficient_history`. Training uses synthetic data. The standalone `GET /api/eres-forecast` route remains proposed. | Reads `check_ins`. |
| **Persisted recommendation and checklist** | Reads the English recommendation in Insights and opens all tasks in My plan. | The backend calls Ceres using canonical session-owned data and Eres output, validates the response, and atomically persists the insight and every task. | Reads `check_ins`; writes `check_in_insights` and `check_in_actions`. |
| **Mission context** | Sees departure, current position, destination and cabin temperature for each phase. | The Next.js `GET /api/mission-context?phase=...` route uses the shared signed session and mission registry. Docked position comes from wheretheiss.at; free flight uses CelesTrak/SGP4 when `norad_id` exists, otherwise the labeled simulated point. Database failure uses the built-in demo; a missing phase returns `404`. | Reads mission tables; position responses identify live, snapshot, TLE or simulated provenance. |
| **Mission registration** | Opens Register a mission from the menu and records both mission legs. | Next.js `POST /api/missions` validates the shared signed session, trusted browser Origin and JSON, then atomically creates an ordinary mission, its legs and session link. Public callers cannot select the global demo. | Writes `missions`, `mission_legs`, `session_missions`; reads `mission_places`. |
| **Check-in Actions** | Sees tasks in the **My plan** checklist and uses **Got it**, **Mark complete**, or **Dismiss**. | `POST /api/check-ins/{id}/actions/evaluate` evaluates the actions, `GET /api/check-ins/{id}/actions` lists the records, and `PATCH /api/check-in-actions/{id}` updates a status. **Got it** sends `acknowledged`. | Reads `check_ins` and writes to `check_in_actions`. |

To implement the screens, see [Home](https://www.figma.com/design/7yzLD5bpQkWcU42c7Jsfs1/Mittus?node-id=30-2), [Check-in description](https://www.figma.com/design/7yzLD5bpQkWcU42c7Jsfs1/Mittus?node-id=108-2039), [Custom sleep hours](https://www.figma.com/design/7yzLD5bpQkWcU42c7Jsfs1/Mittus?node-id=108-2221), [Make sense of the changes](https://www.figma.com/design/7yzLD5bpQkWcU42c7Jsfs1/Mittus?node-id=30-274), [Checklist](https://www.figma.com/design/7yzLD5bpQkWcU42c7Jsfs1/Mittus?node-id=30-371), and [Mission registration](https://www.figma.com/design/7yzLD5bpQkWcU42c7Jsfs1/Mittus?node-id=111-1728).

## Check-in Actions flow

1. Save a check-in, then evaluate the latest owned record using its UUID. The server reads canonical session history; the browser cannot submit tasks, predictions or arbitrary health history to persistence.
2. Eres uses the complete chronological history. A ready forecast includes probability, model version and prediction time. Insufficient or unavailable forecasting never invents a probability or a forecast-sourced task.
3. The backend calls the separately deployed Ceres service with at most 90 canonical records and the forecast, excluding session IDs, cookies and descriptions. AI output and deterministic fallback are explicitly distinguished.
4. The accepted evaluation atomically persists `check_in_insights` and all `check_in_actions`, including task identity, title, source and kind. The complete generated `next_step` is retained.
5. Repeating the same evaluation preserves IDs and user progress without another Ceres call. Numeric edits and new-day saves supersede current insights and pending tasks; completed history remains. Network generation runs outside the SQL transaction and stale work returns `409`.
6. My plan lists every current persisted task. Got it, Mark complete and Dismiss update the selected task by ID; history uses saved titles. Forecast display remains available when language-model generation falls back.

Evaluation accepts an empty body and returns `{ status, forecast, insight, actions }`; list returns `{ actions }`; PATCH accepts only the requested legal status transition. Foreign or absent resources return `404`. Global demo selection is seed/manual-admin-only. Fresh databases use the versioned forward migrations; reconcile existing Supabase history and apply the required next-step migration before deployment, without blindly replaying the recovered baseline.

## Feature owners

| Feature | Owner | Others' contributions |
| --- | --- | --- |
| **Daily check-in** | **Luis** implements validation, session-scoped storage, and the API response. | **Gabi** defines the form and labels. **Luigi** implements the form and connects the route. **Neves** configures database access for deployment. **Rodrigo** prepares fictional records. |
| **Home, 3D body, and history** | **Luigi** connects the 3D model and charts to check-in data. | **Gabi** selects a properly licensed model and designs the panel. **Luis** returns records sorted by date. **Neves** verifies that the asset loads in deployment. **Rodrigo** validates the displayed indicators. |
| **Experimental forecast** | **Rodrigo** trains and evaluates Eres. | **Luis** integrates the forecast. **Neves** makes the model available in the deployed environment. **Luigi** displays the forecast and its states. **Gabi** defines how to present its experimental nature. |
| **Recommendation and checklist tasks** | **Giulia** generates the recommendation and tasks using check-in data and the Eres forecast. | **Luigi** displays the recommendation in **Make sense of the changes** and the tasks in **My plan**. |
| **Mission context** | **Neves** prepares NASA samples and the two scenarios. | **Luis** serves the route's JSON. **Luigi** implements selection and updates the card. **Gabi** designs labels identifying the source, time, and simulated data. |
| **Check-in Actions** | **Neves** integrates generated tasks, records actions, and manages status changes. | **Rodrigo** provides test forecasts and the model contract. **Gabi** designs the checklist and its states. **Luigi** connects the screen to the action routes. |

## External sources and integrations

- **Health indicators.** The challenge statement suggests blood pressure, heart rate, blood glucose, body temperature, sleep hours, and mood. Mittus uses sleep hours and mood, and adds self-reported fatigue. NASA's Human Research Program supports the choice to monitor sleep and fatigue. Record its use in the **NASA Data** field. [Challenge statement](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=details) · [NASA sleep research](https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/)
- **ISS position.** `GET https://api.wheretheiss.at/v1/satellites/25544`. The API calculates the current position from the ISS's latest TLE (NORAD) and returns latitude, longitude, altitude, and timestamp. It requires no key and allows at most one request per second, so the backend reuses the response for 5 seconds. Cite the service under **Space Agency Partner Data and Other References**. [Where the ISS at? — documentation](https://wheretheiss.at/w/developer)
- **Launch location.** `GET https://ll.thespacedevs.com/2.3.0/launches/{id}/` (Launch Library 2, The Space Devs) provides the launch pad's latitude, longitude, and launch time. This data is copied once to `mission_places` and `mission_legs` when registering a mission because the free plan allows only a few requests per hour. Cite it under **Other References**. [Launch Library 2 documentation](https://ll.thespacedevs.com/docs/)
- **Spacecraft position in free flight.** `GET https://celestrak.org/NORAD/elements/gp.php?CATNR={norad}&FORMAT=json` returns the spacecraft's latest orbital elements. The backend calculates its position with the SGP4 model (`satellite.js`) and downloads elements no more than every 2 hours, as requested by CelesTrak. Cite it under **Other References**. [CelesTrak — GP data](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- **Cabin temperature.** The orbital scenario can use a historical sample downloaded from the **Data Tables** tab. Store the measurement with its date and source in the scenario file. [NASA — Environmental Data App](https://visualization.osdr.nasa.gov/eda/)
- **Language model.** Gemini is the proposed provider. Generation input consists of the check-in and Eres forecast. Outputs are the recommendation in English and checklist tasks. [Gemini API reference](https://ai.google.dev/api)

## Submission validation

- [ ] Complete all six check-in steps using **Other hours** and an optional description. Reload and verify the values in history. Confirm isolation between two sessions.
- [ ] Open the recommendation from the body discomfort hotspot and check the sleep and fatigue charts. Use the API's 1–7 fatigue scale.
- [ ] Check whether the AI recommendation and tasks reflect the check-in and Eres forecast. In **Make sense of the changes**, check the forecast and open the checklist with **Open task checklist**.
- [ ] Open mission registration from the mission icon and check the mission, outbound-leg, and return-leg fields. Test saving when the route is available, then change the map phase.
- [ ] Repeat a plan evaluation and confirm it does not duplicate actions. Correct a check-in, refresh the forecast, and verify the history and replacement of pending actions. Confirm session isolation when querying and updating an action.
- [ ] Open the checklist from Home and verify that **Got it**, **Mark complete**, and **Dismiss** save the expected status. Test insufficient-history and unavailable-forecast states.
- [ ] In the **Project** tab, explain where NASA sources were used, identify simulated data, and cite the 3D asset, its license, and other references. Disclose actual AI use and identify generated materials as required by the guide.
- [ ] Test the public app and demo links in a private browser window. Show the deployed flow in up to seven slides in English or in a video up to 30 seconds, with English subtitles if the audio is in another language.

[Submission requirements](SUBMISSION-REQUIREMENTS.md) · [MVP plan and owners](docs/superpowers/plans/2026-11-14-mittus-mvp.md)
