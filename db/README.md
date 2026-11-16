# Mittus database seed

`seed.mjs` loads reproducible **simulated** data into `check_ins` and `check_in_actions`. Lookup tables are read-only.

## Seed data

| Set | `session_id` | Contents |
| --- | --- | --- |
| Demo astronaut | `00000000-0000-4000-8000-000000000001` | 21 hand-written check-ins, ending yesterday UTC so the live demo can save today's entry. |
| Synthetic astronauts | `00000000-0000-4000-8000-000000000100` onward | 40 trajectories of 30 days by default, with realistic gaps and five profiles. |
| Suggested tasks | — | One forecast-backed `monitor` or `recheck` task per check-in, generated from that session's history up to the check-in date. |

All seeded sessions use the `00000000-0000-4000-8000-` prefix. The script only deletes or replaces rows in that namespace. Given the same `--seed` and `--end-date`, generated data is deterministic.

## Run

```bash
cd db
npm install
node seed.mjs                                  # generate and print; no database connection
node seed.mjs --env ../path/.env --check       # write in a transaction, validate, then ROLLBACK
node seed.mjs --env ../path/.env --apply       # replace seed rows and COMMIT
node seed.mjs --env ../path/.env --reset       # delete only seed rows
```

Options: `--sessions N` (`0` = demo only), `--days N`, `--end-date YYYY-MM-DD`, `--seed N`, and `--csv PATH`.

The connection uses `DATABASE_URL` from the environment or `--env`. Encode reserved characters in URL credentials (for example, `#` as `%23`). Remote connections require verified TLS certificates; set `PGSSLROOTCERT` to a trusted CA file when needed. Plain PostgreSQL is allowed only for loopback development hosts.

## Scales

Higher values indicate worse conditions: `fatigue` is 1–7; `mood_level`, `stress_level`, and `team_conflict_level` are 1–5. The seed treats `fatigue >= 5` as elevated.
