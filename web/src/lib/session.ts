import { createHmac, timingSafeEqual } from "node:crypto";

/** Cookie issued by the backend (backend/src/session/session.middleware.ts). */
export const SESSION_COOKIE = "mittus_session";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Returns the session id of a valid `mittus_session` token, or null.
 * Same format and checks as the backend: `<uuid>.<expiresAtSeconds>.<hmac>`,
 * HMAC-SHA256 of `<uuid>.<expiresAtSeconds>` with SESSION_SECRET, base64url.
 * This side only reads the cookie; issuing it stays with the backend.
 */
export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string | null {
  if (!token || !secret || secret.length < 32) return null;
  const [id, expiration, signature, extra] = token.split(".");
  if (extra !== undefined || !id || !UUID_V4.test(id)) return null;
  if (!expiration || !/^\d+$/.test(expiration) || Number(expiration) <= nowSeconds) return null;
  if (!signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac("sha256", secret).update(`${id}.${expiration}`).digest("base64url");
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
}
