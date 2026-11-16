import { verifySessionToken } from "../session.ts";
import { validateRegistration, type MissionRegistration } from "./mission-registration.ts";
import type { RegisterResult } from "./mission-store.ts";

type RegistrationOptions = {
  sessionSecret: string | undefined;
  webOrigin: string | undefined;
  nowSeconds?: number;
  register: (registration: MissionRegistration, sessionId: string) => Promise<RegisterResult>;
};

/** HTTP policy and validation without Next.js or database side effects until authorization succeeds. */
export async function handleMissionRegistration(
  request: Request,
  sessionToken: string | undefined,
  options: RegistrationOptions,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    // Only server configuration or the request URL is trusted, never forwarded headers.
    const trustedOrigin = options.webOrigin ?? new URL(request.url).origin;
    try {
      const parsed = new URL(trustedOrigin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== trustedOrigin) throw new Error("origin");
    } catch {
      return Response.json({ error: "registry_unavailable" }, { status: 503 });
    }
    if (origin !== trustedOrigin) return Response.json({ error: "origin_not_allowed" }, { status: 403 });
  }

  // text/plain JSON is a simple browser request and must not bypass CORS preflight.
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return Response.json({ error: "unsupported_media_type" }, { status: 415 });

  const sessionId = verifySessionToken(sessionToken, options.sessionSecret, options.nowSeconds);
  if (!sessionId) return Response.json({ error: "session_required" }, { status: 409 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = validateRegistration(body);
  if (!result.ok) return Response.json({ error: "invalid_registration", fields: result.errors }, { status: 400 });

  const saved = await options.register(result.value, sessionId);
  if (saved.ok) return Response.json({ code: saved.code }, { status: 201 });
  if (saved.reason === "code_taken") {
    return Response.json(
      { error: "code_taken", fields: { code: "This mission code is already registered." } },
      { status: 409 },
    );
  }
  if (saved.reason === "unknown_place") return Response.json({ error: "unknown_place" }, { status: 400 });
  return Response.json({ error: "registry_unavailable" }, { status: 503 });
}
