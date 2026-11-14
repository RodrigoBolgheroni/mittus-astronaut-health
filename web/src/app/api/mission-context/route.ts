import type { NextRequest } from "next/server";

import { getMissionContext } from "@/lib/mission/mission-context";
import { isMissionPhase, MISSION_PHASES } from "@/lib/mission/mission-config";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/** GET /api/mission-context?phase=in_orbit|return_to_earth */
export async function GET(request: NextRequest) {
  const phase = request.nextUrl.searchParams.get("phase") ?? "in_orbit";
  if (!isMissionPhase(phase)) {
    return Response.json(
      { error: "invalid_phase", allowed: MISSION_PHASES },
      { status: 400 },
    );
  }
  // Sessions without a valid cookie (or without SESSION_SECRET configured
  // here) see the demo mission.
  const sessionId = verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.SESSION_SECRET,
  );
  const context = await getMissionContext(phase, sessionId);
  if (!context) {
    return Response.json({ error: "phase_not_in_mission", phase }, { status: 404 });
  }
  return Response.json(context, { headers: { "Cache-Control": "private, no-store" } });
}
