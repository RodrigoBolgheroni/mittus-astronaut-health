import "server-only";

import { getSql } from "@/lib/db";
import { CURRENT_POSITION, type MissionPhase } from "./mission-config";
import { toMissionLegRecord, type MissionLegRecord, type MissionLegRow, type MissionRow } from "./mission-record";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads the mission leg of a session for one phase: the mission linked in
 * session_missions, or the demo mission when the session has none (or no
 * valid session id is known). Returns null when no mission or leg exists.
 */
export async function loadMissionLeg(
  phase: MissionPhase,
  sessionId: string | null,
): Promise<MissionLegRecord | null> {
  const sql = getSql();
  // session_id is a uuid column; anything else would fail the cast.
  const session = sessionId && UUID_RE.test(sessionId) ? sessionId : null;

  const [mission] = await sql<MissionRow[]>`
    select m.id, m.code, m.name, m.norad_id, m.reference_label, m.reference_url
    from public.missions m
    left join public.session_missions s
      on s.mission_id = m.id and s.session_id = ${session}::uuid
    where s.session_id is not null or m.is_demo
    order by (s.session_id is not null) desc
    limit 1
  `;
  if (!mission) return null;

  const [leg] = await sql<MissionLegRow[]>`
    select l.phase, l.departure_at, l.departure_at_source, l.destination_description,
           to_jsonb(dep) as departure_place, to_jsonb(dst) as destination_place
    from public.mission_legs l
    join public.mission_places dep on dep.id = l.departure_place_id
    join public.mission_places dst on dst.id = l.destination_place_id
    where l.mission_id = ${mission.id} and l.phase = ${phase}
  `;
  if (!leg) return null;

  return toMissionLegRecord(mission, leg, CURRENT_POSITION[phase]);
}
