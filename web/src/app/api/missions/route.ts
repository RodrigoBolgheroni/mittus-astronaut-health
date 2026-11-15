import type { NextRequest } from "next/server";

import { validateRegistration } from "@/lib/mission/mission-registration";
import { registerMission } from "@/lib/mission/mission-store";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * POST /api/missions: "Register a mission" (Figma 111:1728). Saves the mission
 * and its two legs, then links it to the session so the mission map shows it.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = validateRegistration(body);
  if (!result.ok) return Response.json({ error: "invalid_registration", fields: result.errors }, { status: 400 });

  const sessionId = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  // Without a session the mission could only be seen as the demo mission.
  if (!sessionId && !result.value.isDemo) {
    return Response.json({ error: "session_required" }, { status: 409 });
  }

  const saved = await registerMission(result.value, sessionId);
  if (saved.ok) return Response.json({ code: saved.code }, { status: 201 });
  if (saved.reason === "code_taken") {
    return Response.json(
      { error: "code_taken", fields: { code: "This mission code is already registered." } },
      { status: 409 },
    );
  }
  if (saved.reason === "unknown_place") {
    return Response.json({ error: "unknown_place" }, { status: 400 });
  }
  return Response.json({ error: "registry_unavailable" }, { status: 503 });
}
