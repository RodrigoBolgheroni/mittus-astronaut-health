import { connection } from "next/server";

import { listMissionPlaces } from "@/lib/mission/mission-store";

/** GET /api/mission-places: saved places for the "Register a mission" form. */
export async function GET() {
  // Read the database on every request (never prerendered).
  await connection();
  const places = await listMissionPlaces();
  if (!places) return Response.json({ error: "registry_unavailable" }, { status: 503 });
  return Response.json({ places }, { headers: { "Cache-Control": "private, no-store" } });
}
