import "server-only";

import { Pool } from "pg";

import { MISSION_PHASES, type MissionPhase } from "./mission-config";
import { BUILT_IN_DEMO_LEGS, legFromRow, type MissionLeg, type MissionLegRow } from "./mission-registry";
import type { MissionPlaceOption } from "@/lib/api/types";
import type { MissionRegistration } from "./mission-registration";

// Reuse one small pool per server instance (and across dev hot reloads).
const globalForPool = globalThis as unknown as { mittusPool?: Pool };

function pool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForPool.mittusPool) {
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
    globalForPool.mittusPool = new Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
      // Fall back to the built-in demo mission instead of hanging. The first
      // TLS connection to Supabase can take several seconds.
      connectionTimeoutMillis: 10_000,
      query_timeout: 5_000,
    });
  }
  return globalForPool.mittusPool;
}

const placeColumns = (alias: string, prefix: string) =>
  ["name", "label", "kind", "tracked_object", "latitude", "longitude", "source", "simulated", "source_url"]
    .map((c) => `${alias}.${c} as ${prefix}${c}`)
    .join(", ");

// The session's own mission if it has one, otherwise the demo mission.
const LEG_QUERY = `
  select m.code as mission_code, m.name as mission_name, m.norad_id, m.reference_label, m.reference_url,
         l.phase, l.departure_at, l.departure_at_source, l.destination_description,
         ${placeColumns("dep", "dep_")}, ${placeColumns("dst", "dst_")}
  from public.missions m
  join public.mission_legs l on l.mission_id = m.id and l.phase = $2
  join public.mission_places dep on dep.id = l.departure_place_id
  join public.mission_places dst on dst.id = l.destination_place_id
  where m.id = coalesce(
    (select sm.mission_id from public.session_missions sm where sm.session_id = $1::uuid),
    (select d.id from public.missions d where d.is_demo)
  )`;

/**
 * Departure and destination of `phase` for the session's mission.
 * Returns null when the mission has no leg for that phase. Falls back to the
 * built-in demo mission if the database is not configured or unreachable.
 */
export async function getMissionLeg(phase: MissionPhase, sessionId: string | null): Promise<MissionLeg | null> {
  const db = pool();
  if (!db) return BUILT_IN_DEMO_LEGS[phase];
  try {
    const { rows } = await db.query<MissionLegRow>(LEG_QUERY, [sessionId, phase]);
    return rows[0] ? legFromRow(rows[0]) : null;
  } catch (error) {
    console.warn("Mission registry unavailable - using built-in demo mission:", error);
    return BUILT_IN_DEMO_LEGS[phase];
  }
}


/** Saved places for the registration form, or null when the database is not configured or unreachable. */
export async function listMissionPlaces(): Promise<MissionPlaceOption[] | null> {
  const db = pool();
  if (!db) return null;
  try {
    const { rows } = await db.query<MissionPlaceOption>(
      "select code, name, label, kind from public.mission_places order by kind desc, name, label",
    );
    return rows;
  } catch (error) {
    console.warn("Mission places unavailable:", error);
    return null;
  }
}

export type RegisterResult =
  | { ok: true; code: string }
  | { ok: false; reason: "unavailable" | "code_taken" | "unknown_place" };

/**
 * Inserts an ordinary mission and both legs in one transaction and links it
 * to the required session (a session has one mission). Demo selection is admin-only.
 */
export async function registerMission(reg: MissionRegistration, sessionId: string): Promise<RegisterResult> {
  const db = pool();
  if (!db) return { ok: false, reason: "unavailable" };
  let client;
  try {
    client = await db.connect();
  } catch (error) {
    console.warn("Mission registry unavailable:", error);
    return { ok: false, reason: "unavailable" };
  }
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string }>(
      `insert into public.missions (code, name, is_demo, ll2_launch_id, norad_id, reference_label, reference_url)
       values ($1, $2, false, $3, $4, $5, $6) returning id`,
      [reg.code, reg.name, reg.ll2LaunchId, reg.noradId, reg.referenceLabel, reg.referenceUrl],
    );
    const missionId = rows[0]!.id;
    for (const phase of MISSION_PHASES) {
      const leg = reg.legs[phase];
      const inserted = await client.query(
        `insert into public.mission_legs
           (mission_id, phase, departure_place_id, departure_at, departure_at_source, destination_place_id, destination_description)
         select $1, $2, dep.id, $3, $4, dst.id, $5
         from public.mission_places dep, public.mission_places dst
         where dep.code = $6 and dst.code = $7`,
        [missionId, phase, leg.departureAt, leg.departureAtSource, leg.destinationDescription, leg.departurePlace, leg.destinationPlace],
      );
      if (inserted.rowCount !== 1) {
        await client.query("rollback");
        return { ok: false, reason: "unknown_place" };
      }
    }
    await client.query(
      `insert into public.session_missions (session_id, mission_id) values ($1::uuid, $2)
       on conflict (session_id) do update set mission_id = excluded.mission_id, created_at = now()`,
      [sessionId, missionId],
    );
    await client.query("commit");
    return { ok: true, code: reg.code };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    if ((error as { code?: string }).code === "23505") return { ok: false, reason: "code_taken" };
    console.warn("Mission registration failed:", error);
    return { ok: false, reason: "unavailable" };
  } finally {
    client.release();
  }
}
