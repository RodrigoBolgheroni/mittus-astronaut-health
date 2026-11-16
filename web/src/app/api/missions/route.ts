import type { NextRequest } from "next/server";

import { handleMissionRegistration } from "@/lib/mission/mission-registration-handler";
import { registerMission } from "@/lib/mission/mission-store";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * POST /api/missions: "Register a mission" (Figma 111:1728). Saves the mission
 * and its two legs, then links it to the session so the mission map shows it.
 */
export async function POST(request: NextRequest) {
  return handleMissionRegistration(request, request.cookies.get(SESSION_COOKIE)?.value, {
    sessionSecret: process.env.SESSION_SECRET,
    webOrigin: process.env.WEB_ORIGIN,
    register: registerMission,
  });
}
