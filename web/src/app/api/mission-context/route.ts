import type { NextRequest } from "next/server";

import { DatabaseNotConfiguredError } from "@/lib/db";
import { isMissionPhase, MISSION_PHASES } from "@/lib/mission/mission-config";
import { getMissionContext, MissionNotRegisteredError } from "@/lib/mission/mission-context";

/** GET /api/mission-context?phase=in_orbit|return_to_earth */
export async function GET(request: NextRequest) {
  const phase = request.nextUrl.searchParams.get("phase") ?? "in_orbit";
  if (!isMissionPhase(phase)) {
    return Response.json(
      { error: "invalid_phase", allowed: MISSION_PHASES },
      { status: 400 },
    );
  }
  try {
    // The session cookie is not implemented yet, so every request uses the
    // default mission. Pass the session id here once it exists.
    return Response.json(await getMissionContext(phase, null));
  } catch (error) {
    if (error instanceof MissionNotRegisteredError) {
      return Response.json({ error: "mission_not_registered" }, { status: 404 });
    }
    if (error instanceof DatabaseNotConfiguredError) {
      console.error(error);
      return Response.json({ error: "database_not_configured" }, { status: 503 });
    }
    console.error("Mission context unavailable:", error);
    return Response.json({ error: "mission_context_unavailable" }, { status: 503 });
  }
}
