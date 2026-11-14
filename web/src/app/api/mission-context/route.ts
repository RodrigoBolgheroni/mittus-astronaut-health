import type { NextRequest } from "next/server";

import { getMissionContext } from "@/lib/mission/mission-context";
import { isMissionPhase, MISSION_PHASES } from "@/lib/mission/mission-config";

/** GET /api/mission-context?phase=in_orbit|return_to_earth */
export async function GET(request: NextRequest) {
  const phase = request.nextUrl.searchParams.get("phase") ?? "in_orbit";
  if (!isMissionPhase(phase)) {
    return Response.json(
      { error: "invalid_phase", allowed: MISSION_PHASES },
      { status: 400 },
    );
  }
  return Response.json(await getMissionContext(phase));
}
