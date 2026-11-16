# Mittus MVP Alignment

Mittus is a **web app for astronaut health monitoring**. The proposed submission demonstrates a scenario of **fatigue before returning to Earth**, connecting the daily check-in and Eres experimental forecast to an AI-generated recommendation and tasks.

## Proposed submission features

| Area | What needs to work |
| --- | --- |
| **Daily check-in** | Complete stress, mood, team conflict, and fatigue ratings with sleep hours, an optional description, and a review step. Use Lucide faces for the scales and accept a custom sleep value through **Other hours**. Save the entry and update history. |
| **Home, 3D body, and history** | Open the checklist from Home. Use the interactive body hotspot to view a discomfort recommendation. Review aligned sleep and fatigue charts and recent history entries. |
| **Machine-learning forecast** | Estimate the chance that the astronaut will **report high fatigue at the next check-in**. Show the experimental forecast below the AI recommendation and identify simulated data. |
| **AI-generated recommendation and tasks** | Giulia's AI receives the check-in data and Eres forecast. It generates the English recommendation for **Make sense of the changes** and the tasks shown in **My plan**. |
| **Mission context and registration** | Open **Register a mission** from the menu icon. The form covers mission details and outbound and return legs. On the map, switch between phases and view position, departure, destination, and cabin temperature when available. |
| **Check-in Actions** | Neves records actions and manages their states. The astronaut opens the checklist from Home or the recommendation. In **My plan**, they use **Got it**, **Mark complete**, or **Dismiss**. |

Routes, tables, and feature owners are listed in [FEATURES.md](../../../FEATURES.md).

NASA's Human Research Program links inadequate sleep and irregular schedules to risks to performance and health. Use this source to explain why the app monitors sleep and fatigue. Document the data source, model evaluation method, and the distinction between NASA research and the team's simulated data. [NASA — Risk from Inadequate Sleep and Irregular Schedules](https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/)

## Demo walkthrough

1. Open a fictional astronaut's dashboard in orbit and review the recent history.
2. Complete the check-in using **Other hours** and an optional description. Save it and confirm the entry appears in history.
3. Open the discomfort recommendation from the body view and review the sleep and fatigue charts in history.
4. Open **Make sense of the changes** and review the recommendation and Eres forecast.
5. Select **Open task checklist** to view the tasks. Use **Got it** and **Mark complete**, then reload to confirm the saved status.
6. Open **Register a mission** from the menu icon. Return to the map, select **Return to Earth**, and review the context.

## Submission validation

- [ ] The app opens in English at its public URL. A judge can complete the flow in a private browser window.
- [ ] Sleep entered through **Other hours** and the optional description remain visible in the saved check-in after reloading. States are readable in text, navigable by keyboard, and usable on a small screen.
- [ ] The forecast uses only data available up to the current check-in. Evaluate the model on held-out test scenarios and compare it with a simple rule, such as repeating the last recorded fatigue level. If ML is still pending at submission time, demonstrate the flow with the rule and describe it accurately.
- [ ] The mission option in the menu opens registration. Check the mission details, both legs, and the map phase change.
- [ ] The AI recommendation and tasks use the check-in data and Eres forecast. Test the insufficient-history forecast state.
- [ ] Open the checklist from Home and confirm **Got it** saves `acknowledged`. Test completing, dismissing, reloading, and switching sessions.
- [ ] Repeat an evaluation and confirm it reuses the action. Edit the check-in and verify pending actions are replaced when the evaluation changes.
- [ ] The demo and **Project** tab show the deployed flow and describe how NASA sources and ML are used in the implementation. [Submission requirements](../../../SUBMISSION-REQUIREMENTS.md)

## Beyond the MVP

Smartwatch integration, sensor data collection, real spacecraft telemetry, additional mission contexts, and models for other health indicators.

## Integration points

The proposed schedule is in **Brasília time**, starting on **Saturday, November 14 at 2:00 p.m.** and resuming on **Sunday, November 15 at 9:30 a.m.** The target submission time is **6:00 p.m. Sunday**. The platform deadline is **11:59 p.m.** At the start, Rodrigo checks whether Campinas has announced an earlier local submission requirement. [Submission requirements](../../../SUBMISSION-REQUIREMENTS.md)

### Database — first technical deliverable

- **2:00–2:25 p.m.** Luis and Neves align the API contract with the [Supabase schema](../../../FEATURES.md#database). Confirm with Rodrigo and Gabi which fields appear in the form and the mood and fatigue scales.
- **2:25–3:15 p.m.** Neves configures the server connection. Luis and Rodrigo prepare a reproducible fictional history. The backend calculates the forecast from `check_ins` and records the plan in `check_in_actions`. Mission scenarios remain in the application.
- **Acceptance at 3:15 p.m.** The migration runs against an empty database. The backend connects, writes, and reads a fictional check-in. Reading through session A finds the record, while session B remains isolated. Luis and Neves confirm that credentials stay in server configuration.
- **In parallel.** Luigi builds the frontend using the JSON agreed on at 2:25 p.m. Rodrigo works with synthetic histories in the same format. Frontend and forecast integration then use backend data.

| Time | Team deliverable |
| --- | --- |
| **Sat., 2:00–2:25 p.m. · 25 min** | The team finalizes the demo scenario and chooses a stack they already know how to deploy. The meeting ends with a shared example posted in the team channel. Luis records a check-in with a date, sleep hours, and mood and fatigue scales. Rodrigo adds a fictional forecast output and an insufficient-history state. Neves confirms how each component will be deployed. |
| **Sat., 3:15 p.m.** | Luis and Neves verify the migration, backend connection, and session-scoped check-in write/read. Based on this test, Luis connects the API contract to the database. |
| **Sat., 4:00 p.m.** | Gabi delivers the wireframe and 3D asset. Rodrigo shares the expanded fictional history. Luis delivers complete API response examples, and Neves publishes the first test URL. Luigi updates the prototype with the examples while the real API is being completed. |
| **Sat., 8:00 p.m.** | First integrated version. Test by saving a check-in, reloading, changing the phase, and checking the forecast, recommendation, and checklist tasks. Assign an owner to each issue for Sunday. |
| **Sun., 11:30 a.m.** | The team chooses the demo version based on what works at the public URL. If the forecast fails, consider using the fallback rule. Until **12:30 p.m.**, fix only issues that block the user journey. |
| **Sun., 3:30–6:00 p.m.** | At 3:30 p.m., the demo and **Project** page are ready for review. Test as a judge until 5:00 p.m. and submit by 6:00 p.m. |

On Saturday, reserve **5:30–6:00 p.m.** for a break. On Sunday, reserve **12:30–1:30 p.m.** The blocks below continue through Sunday's team review. After 5:00 p.m., Rodrigo handles submission, and everyone remains available to fix blockers in their area.

### Gabi — Design and demo

| When | Task and deliverable |
| --- | --- |
| **Sat., 2:25–4:00 p.m. · 1h 35m** | Design the check-in → history → recommendation and forecast → checklist sequence. Include the discomfort hotspot on Home and mission registration in the menu. Choose a lightweight, licensed 3D figure with Luigi and record its source. |
| **Sat., 4:00–5:30 p.m. · 1h 30m** | Deliver English copy, dashboard hierarchy, and invalid-form, unavailable-forecast, and loading states. Sketch the demo. The proposal is an English slide deck with application screenshots. |
| **Sat., 6:00–8:00 p.m. · 2h** | Review the implemented flow with Luigi on desktop and a narrow screen. Check that states are readable, the form is quick to complete, and the checklist is easy to find. |
| **Sun., 9:30 a.m.–12:30 p.m. · 3h** | Review visual fixes and finalize the demo script with Rodrigo. Validate the flow and English terminology in the selected version at 11:30 a.m. |
| **Sun., 1:30–3:30 p.m. · 2h** | Capture screenshots of the public version and publish the demo. Include the team and names, challenge, NASA source, check-in, dashboard, forecast, recommendation, and checklist in **up to seven slides**. Send Rodrigo the link. |

### Luigi — Frontend

| When | Task and deliverable |
| --- | --- |
| **Sat., 2:25–4:00 p.m. · 1h 35m** | Create the base screen and English form. Use Luis's example to display history, chart, and forecast state. Send Neves the test URL or run instructions. |
| **Sat., 4:00–5:30 p.m. · 1h 30m** | Integrate the 3D figure with an interactive hotspot and text button. Build the phase selector and mission-context card. |
| **Sat., 6:00–8:00 p.m. · 2h** | Connect registration and history to Luis's API. After saving, update the chart and forecast. Load context for the selected phase and show loading and failure states. |
| **Sun., 9:30 a.m.–12:30 p.m. · 3h** | Reproduce issues from the first version. Test keyboard navigation, narrow screens, reloads, unavailable 3D, and card updates after phase changes. Fix flow blockers. |
| **Sun., 1:30–3:30 p.m. · 2h** | Prepare screens for capture with Gabi. Monitor the public version and confirm the text button keeps the panel accessible if the 3D scene fails. |

### Luis — API and persistence

| When | Task and deliverable |
| --- | --- |
| **Sat., 2:25–3:15 p.m. · 50 min** | Check `check_ins` and `check_in_actions`. Prepare fictional history with Rodrigo and test session-scoped writes and reads with Neves. |
| **Sat., 3:15–4:00 p.m. · 45 min** | Connect registration and history endpoints to the database. Publish response examples, including the evaluation and mission-context structures. |
| **Sat., 4:00–5:30 p.m. · 1h 30m** | Verify writes, queries, and invalid entries. Prepare initial history for each session so two judges can repeat the demo without interfering with each other's records. |
| **Sat., 6:00–8:00 p.m. · 2h** | Connect forecast output to the dashboard. Test a new check-in with Luigi, from submission to the updated dashboard. |
| **Sun., 9:30 a.m.–12:30 p.m. · 3h** | Repeat the test with two independent sessions and one invalid entry. Fix persistence issues and standardize the response when history is insufficient for the forecast. |
| **Sun., 1:30–3:30 p.m. · 2h** | Document how to start the API and repeat the scenario. Review the documentation with Neves and confirm the dashboard displays forecast output received from the API. |

### Neves — Check-in Actions and deployment

Integrate AI-generated tasks with Check-in Actions and handle persistence and status changes.

| When | Task and deliverable |
| --- | --- |
| **Sat., 2:25–3:15 p.m. · 50 min** | Provision the development database, configure the server connection, and test the migration and session isolation with Luis. |
| **Sat., 3:15–4:00 p.m. · 45 min** | Publish the first test URL. Configure the database connection in the deployed environment and align with Rodrigo on how the API will run the forecast model. |
| **Sat., 4:00–5:30 p.m. · 1h 30m** | Prepare the browser-to-API path and test mission-context loading. Record how to restore the last working version. |
| **Sat., 6:00–8:00 p.m. · 2h** | Deploy the frontend, API, and available services. Verify 3D access, registration, forecast, and mission context in the deployed version. Share the test link and deployed commit. |
| **Sun., 9:30 a.m.–12:30 p.m. · 3h** | Test the version as a visitor and simulate forecast unavailability. At 11:30 a.m., show the team the working version and tested fallback path. Publish the selected version by 12:30 p.m. |
| **Sun., 1:30–3:30 p.m. · 2h** | In a private browser window, check the app, project access, and demo link as soon as Gabi delivers them. Send Rodrigo the final links. Use the hosting provider's public URL if the custom domain is still pending. |

### Rodrigo — Machine learning and submission

| When | Task and deliverable |
| --- | --- |
| **Sat., 2:25–4:00 p.m. · 1h 35m** | Define the target as **high fatigue reported at the next check-in**. Prepare synthetic histories for sleep, mood, and fatigue, including the demo's common example. Document the NASA source supporting the indicator and tell Luis the forecast format. |
| **Sat., 4:00–5:30 p.m. · 1h 30m** | Train a small model using data available up to the current check-in. Hold out different simulated trajectories for testing and compare against the rule that repeats the last recorded level. Save results and explain the limitations of simulated data. |
| **Sat., 6:00–8:00 p.m. · 2h** | Deliver the forecast function, fallback rule, and sufficient- and insufficient-history output examples to Luis and Neves. Verify with Luigi that the dashboard displays the expected result. |
| **Sun., 9:30 a.m.–12:30 p.m. · 3h** | Test the model in the app, document which approach is in the selected version, and review the result text. Confirm the six team members and the local instructions collected during Saturday's alignment. |
| **Sun., 1:30–6:00 p.m. · 4h 30m** | By 3:30 p.m., finish the **Project** page and English README with sources, links, simulated data, and AI-use disclosure. By 5:00 p.m., test the flow and links with the team. By 6:00 p.m., click **Submit for Judging** and confirm submission. |

### Giulia — AI recommendations and tasks

- Generate the English recommendation and checklist tasks from the check-in and Eres forecast.
- Align with Neves on how tasks reach Check-in Actions. Review the recommendation and task display with Luigi. Give Rodrigo the AI-use description for the submission.

### Team review and submission

- **Sun., 3:30–5:00 p.m. · 1h 30m.** Gabi opens the URL in a private browser window and completes the flow without instructions. Luigi checks interactions. Luis verifies the record. Neves checks Check-in Actions, deployment, and links. Rodrigo compares the forecast with the data. Giulia checks the recommendation and tasks. Adjust the demo and portal copy to match the version that passed.
- **Sun., 5:00–6:00 p.m. · 1h.** Rodrigo submits and saves the confirmation. Everyone else resolves issues in their area. If changes are made after submission, Rodrigo resubmits and confirms the final version before 11:59 p.m.
