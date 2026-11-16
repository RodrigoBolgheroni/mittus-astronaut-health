#!/usr/bin/env node
/**
 * Mittus — reproducible data load (seed) for the Supabase database.
 *
 * Loads into public.check_ins and public.check_in_actions:
 *   1. The demo astronaut: 21 hand-written check-ins showing rising fatigue
 *      before the return to Earth (the scenario from the MVP plan).
 *   2. Synthetic astronauts (optional): generated trajectories with different
 *      profiles, for training/testing the fatigue forecast. Same PRNG seed →
 *      same data.
 *
 * All data is SIMULATED. Every seeded session_id lives in the namespace
 * 00000000-0000-4000-8000-xxxxxxxxxxxx, so the script only ever deletes or
 * replaces its own rows; check-ins from real app sessions are never touched.
 * The *_options lookup tables are already filled by the migration and are
 * only read, never written.
 *
 * Usage (from this folder, after `npm install`):
 *   node seed.mjs                       dry run: generates and prints, no DB connection
 *   node seed.mjs --check               writes inside a transaction, verifies, ROLLBACK
 *   node seed.mjs --apply               writes and COMMITs (replaces previous seed rows)
 *   node seed.mjs --reset               deletes only the seed rows
 *
 * Options:
 *   --sessions N      synthetic astronauts (default 40, 0 = demo only)
 *   --days N          days per synthetic astronaut (default 30)
 *   --end-date DATE   last check-in date, YYYY-MM-DD (default: yesterday, so
 *                     the demo can save "today" live)
 *   --seed N          PRNG seed (default 2026)
 *   --csv PATH        also write every generated check-in to a CSV (for ML)
 *   --env PATH        read DATABASE_URL from this .env file
 *
 * The connection comes from DATABASE_URL (environment variable or --env).
 * Prefer --env over `node --env-file`: Node's parser cuts unquoted values at
 * "#", which breaks passwords containing that character.
 *   node seed.mjs --env ../../ceres/.env --check
 */
import fs from 'node:fs';

// ---------------------------------------------------------------- constants
const SEED_PREFIX = '00000000-0000-4000-8000-';
const DEMO_SESSION_ID = `${SEED_PREFIX}000000000001`;
const RULESET_VERSION = 'seed-rules-v1';
const MODEL_VERSION = 'seed-heuristic-v1';
const HIGH_FATIGUE = 5; // fatigue_options: 5 = "Moderately tired and fatigued"

// Scales (from the *_options tables; higher = worse on every scale):
//   sleep_hours 0–24 · fatigue 1–7 · mood_level 1–5 · stress_level 1–5 · team_conflict_level 1–5

// Demo astronaut: 21 days. Days 1–10 routine orbit, 11–16 return prep and
// shifted schedule, 17–21 accumulated sleep debt before landing.
// [sleep_hours, fatigue, mood_level, stress_level, team_conflict_level, description]
const DEMO_DAYS = [
  [7.5, 2, 2, 1, 1, 'Routine science block. Felt rested.'],
  [7.0, 2, 2, 2, 1, null],
  [7.25, 2, 1, 1, 1, 'EVA prep went well.'],
  [6.75, 3, 2, 2, 1, null],
  [7.0, 2, 2, 2, 1, null],
  [7.5, 2, 1, 1, 1, null],
  [6.5, 3, 2, 2, 2, null],
  [7.0, 3, 2, 2, 1, null],
  [6.75, 3, 2, 2, 1, null],
  [7.0, 2, 2, 2, 1, 'Last full week before return prep.'],
  [6.25, 3, 2, 3, 2, 'Schedule shifted for deorbit training.'],
  [6.0, 3, 3, 3, 2, null],
  [5.75, 4, 3, 3, 2, null],
  [6.0, 4, 3, 3, 2, 'Cargo packing ran late.'],
  [5.5, 4, 3, 3, 3, null],
  [5.75, 4, 3, 4, 2, null],
  [5.25, 5, 3, 4, 3, 'Woke up several times. Hard to focus during checklist review.'],
  [5.5, 4, 3, 4, 2, null],
  [5.0, 5, 4, 4, 3, null],
  [4.75, 5, 4, 4, 3, 'Very tired after the landing rehearsal.'],
  [5.0, 5, 4, 4, 2, null],
];

const SYNTHETIC_NOTES = [
  'Long robotics session.', 'Noisy night in the module.', 'Exercise block felt hard.',
  'Good call with family.', 'Experiment ran over schedule.', 'Slept through the alarm.',
  'Minor disagreement during task planning.', 'Felt focused today.',
];

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const a = { mode: 'dry', sessions: 40, days: 30, seed: 2026, endDate: null, csv: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) die(`missing value for ${k}`); return v; };
    if (k === '--check') a.mode = 'check';
    else if (k === '--apply') a.mode = 'apply';
    else if (k === '--reset') a.mode = 'reset';
    else if (k === '--sessions') a.sessions = int(next(), k, 0, 500);
    else if (k === '--days') a.days = int(next(), k, 2, 365);
    else if (k === '--seed') a.seed = int(next(), k, 0, 2 ** 31);
    else if (k === '--end-date') { a.endDate = next(); if (!/^\d{4}-\d{2}-\d{2}$/.test(a.endDate)) die('--end-date must be YYYY-MM-DD'); }
    else if (k === '--csv') a.csv = next();
    else if (k === '--env') a.env = next();
    else if (k === '--help' || k === '-h') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('*/')[0]); process.exit(0); }
    else die(`unknown option ${k}`);
  }
  a.endDate ??= localDate(-1);
  return a;
}
function int(v, name, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) die(`${name} must be an integer between ${min} and ${max}`);
  return n;
}
function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

// ---------------------------------------------------------------- helpers
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const roundTo = (v, step) => Math.round(v / step) * step;
function localDate(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}
function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const sessionId = (n) => `${SEED_PREFIX}${n.toString(16).padStart(12, '0')}`;

// ---------------------------------------------------------------- generation
function demoCheckIns(endDate) {
  const start = addDays(endDate, -(DEMO_DAYS.length - 1));
  return DEMO_DAYS.map(([sleep_hours, fatigue, mood_level, stress_level, team_conflict_level, description], i) => ({
    session_id: DEMO_SESSION_ID, profile: 'demo_pre_return', check_in_date: addDays(start, i),
    sleep_hours, fatigue, mood_level, stress_level, team_conflict_level, description,
  }));
}

const PROFILES = {
  stable:            { sleep: () => 0,           fat: () => 0,         stress: () => 0 },
  gradual_decline:   { sleep: (t) => -1.6 * t,   fat: (t) => 1.2 * t,  stress: (t) => 1.0 * t },
  pre_return_stress: { sleep: (t) => (t > 0.5 ? -2.0 * (t - 0.5) * 2 : 0), fat: (t) => (t > 0.5 ? 1.5 * (t - 0.5) * 2 : 0), stress: (t) => (t > 0.5 ? 1.8 * (t - 0.5) * 2 : 0) },
  acute_episodes:    { sleep: () => 0,           fat: () => 0,         stress: () => 0, episodes: true },
  recovery:          { sleep: (t) => -1.5 * (1 - t), fat: (t) => 1.5 * (1 - t), stress: (t) => 1.0 * (1 - t) },
};
const PROFILE_NAMES = Object.keys(PROFILES);

function syntheticCheckIns({ sessions, days, seed, endDate }) {
  const rand = mulberry32(seed);
  const noise = (sd) => (rand() + rand() + rand() - 1.5) * sd * 1.41; // ~N(0, sd)
  const rows = [];
  const start = addDays(endDate, -(days - 1));
  for (let s = 0; s < sessions; s++) {
    const profile = PROFILE_NAMES[s % PROFILE_NAMES.length];
    const p = PROFILES[profile];
    const id = sessionId(0x100 + s);
    const baseSleep = 6.6 + rand() * 1.2;      // individual baseline
    const fatigueBias = noise(0.4);
    const episodeDays = new Set();
    if (p.episodes) for (let e = 0, n = 1 + Math.floor(rand() * 3); e < n; e++) episodeDays.add(Math.floor(rand() * days));
    let debt = 0;
    for (let d = 0; d < days; d++) {
      if (rand() < 0.08 && d !== days - 1) continue; // missed check-in (realistic gaps)
      const t = days === 1 ? 1 : d / (days - 1);
      const episode = episodeDays.has(d);
      const sleep = clamp(roundTo(baseSleep + p.sleep(t) + noise(0.5) - (episode ? 2.5 : 0), 0.25), 3, 9.5);
      debt = 0.6 * debt + 0.4 * Math.max(0, 7.5 - sleep);
      const fatigue = Math.round(clamp(2.3 + fatigueBias + 0.9 * debt + p.fat(t) + noise(0.45) + (episode ? 1.5 : 0), 1, 7));
      const stress = Math.round(clamp(1.8 + p.stress(t) + 0.3 * (fatigue - 3) + noise(0.45), 1, 5));
      const mood = Math.round(clamp(1.8 + 0.35 * (fatigue - 3) + 0.35 * (stress - 2) + noise(0.45), 1, 5));
      const conflict = Math.round(clamp(1.2 + 0.4 * (stress - 2) + noise(0.55), 1, 5));
      rows.push({
        session_id: id, profile, check_in_date: addDays(start, d),
        sleep_hours: sleep, fatigue, mood_level: mood, stress_level: stress, team_conflict_level: conflict,
        description: rand() < 0.12 ? SYNTHETIC_NOTES[Math.floor(rand() * SYNTHETIC_NOTES.length)] : null,
      });
    }
  }
  return rows;
}

// Timestamps: morning check-in (07:00–08:59 UTC), deterministic per row.
function withTimestamps(rows, seed) {
  const rand = mulberry32(seed ^ 0x5eed);
  return rows.map((r) => {
    const created = new Date(`${r.check_in_date}T07:00:00Z`);
    created.setUTCMinutes(Math.floor(rand() * 120));
    return { ...r, created_at: created.toISOString() };
  });
}

// ---------------------------------------------------------------- actions
// Experimental heuristic forecast using only check-ins up to the current one
// (no look-ahead), plus the rule set that turns it into suggested actions.
function forecast(history) {
  const last3 = history.slice(-3);
  const avg = (k) => last3.reduce((s, r) => s + Number(r[k]), 0) / last3.length;
  const z = -4.2 + 0.75 * avg('fatigue') + 0.45 * Math.max(0, 7 - avg('sleep_hours')) + 0.2 * (avg('stress_level') - 2);
  return Math.round((1 / (1 + Math.exp(-z))) * 1000) / 1000;
}

function evaluate(row, prob) {
  const actions = [];
  if (row.fatigue >= 6 || prob >= 0.85) actions.push(['contact_medical', 'severe_fatigue_or_high_risk']);
  if (row.team_conflict_level >= 4) actions.push(['contact_crew', 'team_conflict_high']);
  if (!actions.some(([a]) => a === 'contact_medical') && (row.fatigue >= HIGH_FATIGUE || row.sleep_hours < 5.5 || prob >= 0.5)) {
    const reason = row.fatigue >= HIGH_FATIGUE ? 'high_fatigue_reported' : row.sleep_hours < 5.5 ? 'low_sleep' : 'elevated_fatigue_risk';
    actions.push(['recheck', reason]);
  }
  if (actions.length === 0) actions.push(['monitor', 'within_expected_range']);
  return actions;
}

function buildActions(checkIns) {
  const bySession = Map.groupBy(checkIns, (r) => r.session_id);
  const out = [];
  for (const rows of bySession.values()) {
    rows.sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
    rows.forEach((row, i) => {
      const prob = forecast(rows.slice(0, i + 1));
      const created = new Date(new Date(row.created_at).getTime() + 60_000);
      const age = rows.length - 1 - i; // 0 = latest check-in of the session
      for (const [action_code, reason_code] of evaluate(row, prob)) {
        let status = 'completed', acknowledged_at = null, resolved_at = null;
        if (age === 0) status = 'suggested';
        else if (age === 1 && action_code !== 'monitor') { status = 'acknowledged'; acknowledged_at = new Date(created.getTime() + 3_600_000).toISOString(); }
        else {
          acknowledged_at = new Date(created.getTime() + 3_600_000).toISOString();
          resolved_at = new Date(created.getTime() + 6 * 3_600_000).toISOString();
        }
        out.push({
          session_id: row.session_id, check_in_date: row.check_in_date,
          evaluation_key: `${RULESET_VERSION}:${row.check_in_date}`,
          action_code, reason_code, ruleset_version: RULESET_VERSION,
          forecast_snapshot: { model_version: MODEL_VERSION, predicted_at: created.toISOString(), probability_high_fatigue: prob, high_fatigue_threshold: HIGH_FATIGUE, simulated: true },
          status, created_at: created.toISOString(), acknowledged_at, resolved_at,
        });
      }
    });
  }
  return out;
}

// ---------------------------------------------------------------- database
function readDatabaseUrl(envPath) {
  if (!envPath) return process.env.DATABASE_URL;
  // Read the line as-is: dotenv parsers (including node --env-file) treat an
  // unquoted "#" as a comment and would cut a password that contains one.
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (!line) die(`DATABASE_URL not found in ${envPath}`);
  return line.slice(line.indexOf('=') + 1);
}

function connectionConfig(envPath) {
  const url = readDatabaseUrl(envPath)?.trim().replace(/^["']|["']$/g, '');
  if (!url) die('DATABASE_URL is not set (use --env path/to/.env or export DATABASE_URL)');
  // Parse by hand so passwords with URL-special characters (@ # / % ...) work unencoded.
  const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):(.*)@([^@:/]+):(\d+)\/([^?]*)/);
  if (!m) die('DATABASE_URL must look like postgresql://user:password@host:port/database');
  return { user: decodeURIComponent(m[1]), password: m[2], host: m[3], port: Number(m[4]), database: m[5] || 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 };
}

async function deleteSeedRows(c) {
  // check_in_actions rows go with ON DELETE CASCADE.
  const r = await c.query(`delete from public.check_ins where session_id::text like $1`, [`${SEED_PREFIX}%`]);
  return r.rowCount;
}

async function insertAll(c, checkIns, actions) {
  const ids = new Map();
  for (let i = 0; i < checkIns.length; i += 1000) {
    const chunk = checkIns.slice(i, i + 1000);
    const col = (k) => chunk.map((r) => r[k]);
    const r = await c.query(
      `insert into public.check_ins
         (session_id, check_in_date, sleep_hours, fatigue, mood_level, stress_level, team_conflict_level, description, created_at, updated_at)
       select s, d, sl, f, mo, st, tc, de, ca, ca
       from unnest($1::uuid[], $2::date[], $3::numeric[], $4::smallint[], $5::smallint[], $6::smallint[], $7::smallint[], $8::text[], $9::timestamptz[])
         as t(s, d, sl, f, mo, st, tc, de, ca)
       returning id, session_id, to_char(check_in_date, 'YYYY-MM-DD') as d`,
      [col('session_id'), col('check_in_date'), col('sleep_hours'), col('fatigue'), col('mood_level'), col('stress_level'), col('team_conflict_level'), col('description'), col('created_at')],
    );
    for (const row of r.rows) ids.set(`${row.session_id}|${row.d}`, row.id);
  }
  for (let i = 0; i < actions.length; i += 1000) {
    const chunk = actions.slice(i, i + 1000);
    const col = (k) => chunk.map((r) => r[k]);
    await c.query(
      `insert into public.check_in_actions
         (check_in_id, evaluation_key, action_code, reason_code, ruleset_version, forecast_snapshot, status, created_at, acknowledged_at, resolved_at)
       select * from unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::jsonb[], $7::text[], $8::timestamptz[], $9::timestamptz[], $10::timestamptz[])`,
      [chunk.map((a) => ids.get(`${a.session_id}|${a.check_in_date}`)), col('evaluation_key'), col('action_code'), col('reason_code'), col('ruleset_version'),
        chunk.map((a) => JSON.stringify(a.forecast_snapshot)), col('status'), col('created_at'), col('acknowledged_at'), col('resolved_at')],
    );
  }
}

async function verify(c) {
  const r = await c.query(
    `select
       (select count(*)::int from public.check_ins where session_id::text like $1) as seed_check_ins,
       (select count(*)::int from public.check_in_actions a join public.check_ins c on c.id = a.check_in_id where c.session_id::text like $1) as seed_actions,
       (select count(distinct session_id)::int from public.check_ins where session_id::text like $1) as seed_sessions,
       (select count(*)::int from public.check_ins where session_id::text not like $1) as other_check_ins`,
    [`${SEED_PREFIX}%`],
  );
  return r.rows[0];
}

// ---------------------------------------------------------------- output
function writeCsv(path, rows) {
  const cols = ['session_id', 'profile', 'check_in_date', 'sleep_hours', 'fatigue', 'mood_level', 'stress_level', 'team_conflict_level', 'description'];
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  fs.writeFileSync(path, [cols.join(','), ...rows.map((r) => cols.map((k) => esc(r[k])).join(','))].join('\n') + '\n');
}

function summary(checkIns, actions, args) {
  const demo = checkIns.filter((r) => r.session_id === DEMO_SESSION_ID);
  const sessions = new Set(checkIns.map((r) => r.session_id)).size;
  const high = checkIns.filter((r) => r.fatigue >= HIGH_FATIGUE).length;
  console.log(`Mittus seed · mode=${args.mode} · seed=${args.seed} · end-date=${args.endDate}`);
  console.log(`  sessions: ${sessions} (1 demo + ${sessions - 1} synthetic) · check-ins: ${checkIns.length} · actions: ${actions.length}`);
  console.log(`  check-ins with fatigue >= ${HIGH_FATIGUE}: ${high} (${((100 * high) / checkIns.length).toFixed(1)}%)`);
  const byAction = Object.entries(Object.groupBy(actions, (a) => a.action_code)).map(([k, v]) => `${k}=${v.length}`).join(' ');
  console.log(`  actions by code: ${byAction}`);
  console.log(`\nDemo astronaut (${DEMO_SESSION_ID}), last 7 check-ins:`);
  const demoActions = Map.groupBy(actions.filter((a) => a.session_id === DEMO_SESSION_ID), (a) => a.check_in_date);
  console.table(demo.slice(-7).map((r) => ({
    date: r.check_in_date, sleep: r.sleep_hours, fatigue: r.fatigue, mood: r.mood_level, stress: r.stress_level, conflict: r.team_conflict_level,
    p_high_fatigue: demoActions.get(r.check_in_date)[0].forecast_snapshot.probability_high_fatigue,
    actions: demoActions.get(r.check_in_date).map((a) => `${a.action_code}(${a.status})`).join(', '),
  })));
}

// ---------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const checkIns = withTimestamps([...demoCheckIns(args.endDate), ...syntheticCheckIns(args)], args.seed);
  const actions = buildActions(checkIns);

  if (args.mode !== 'reset') summary(checkIns, actions, args);
  if (args.csv) { writeCsv(args.csv, checkIns); console.log(`\nCSV written: ${args.csv}`); }
  if (args.mode === 'dry') { console.log('\nDry run: nothing was written. Use --check (rollback) or --apply.'); return; }

  const { default: pg } = await import('pg');
  const c = new pg.Client(connectionConfig(args.env));
  await c.connect();
  try {
    await c.query('begin');
    const deleted = await deleteSeedRows(c);
    if (args.mode !== 'reset') await insertAll(c, checkIns, actions);
    const v = await verify(c);
    console.log(`\nDatabase: removed ${deleted} previous seed check-ins.`, v);
    if (args.mode !== 'reset' && (v.seed_check_ins !== checkIns.length || v.seed_actions !== actions.length)) throw new Error('row counts do not match what was generated');
    if (args.mode === 'check') { await c.query('rollback'); console.log('Check passed: all constraints accepted the data. ROLLBACK — nothing was saved.'); }
    else { await c.query('commit'); console.log(args.mode === 'reset' ? 'Seed rows deleted (COMMIT).' : 'Seed applied (COMMIT).'); }
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
