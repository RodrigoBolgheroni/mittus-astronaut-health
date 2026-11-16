import { buildCeresRequest } from "@/lib/ceres/request";

// Ceres waits up to 45 s for the model; leave room for it (see ceres.md).
const CERES_TIMEOUT_MS = 60_000;

export const maxDuration = 60;

/**
 * POST /api/recommendations  { check_ins, forecast? }
 *
 * Server-side proxy to Ceres `POST /v1/recommendations`. Ceres has no
 * authentication and must not be reachable from the browser, so only this
 * route knows `CERES_URL`. The body is rebuilt with the contract fields only.
 */
export async function POST(request: Request) {
  const baseUrl = process.env.CERES_URL?.replace(/\/+$/, "");
  if (!baseUrl) return Response.json({ error: "ceres_not_configured" }, { status: 503 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const { check_ins, forecast } = (payload && typeof payload === "object" ? payload : {}) as {
    check_ins?: unknown;
    forecast?: unknown;
  };
  const body = buildCeresRequest(check_ins, forecast);
  if (!body) return Response.json({ error: "invalid_check_ins" }, { status: 400 });

  try {
    const upstream = await fetch(`${baseUrl}/v1/recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CERES_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!upstream.ok) return Response.json({ error: "ceres_error", status: upstream.status }, { status: 502 });
    const data: unknown = await upstream.json();
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "ceres_unavailable" }, { status: 503 });
  }
}
