import "server-only";

import { Pool } from "pg";

import type { MissionPhase } from "./mission-config";
import { BUILT_IN_DEMO_LEGS, legFromRow, type MissionLeg, type MissionLegRow } from "./mission-registry";

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
  select m.code as mission_code, m.name as mission_name, m.reference_label, m.reference_url,
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
