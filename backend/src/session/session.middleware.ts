import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RuntimeConfig } from '../config.js';
import { Clock } from '../common/clock.js';
import { ApiError } from '../common/api-error.js';

export type SessionRequest = Request & { sessionId: string };
const lifetimeSeconds = 30 * 24 * 60 * 60;

export function sessionMiddleware(config: RuntimeConfig, clock: Clock) {
  const sign = (payload: string) =>
    createHmac('sha256', config.sessionSecret)
      .update(payload)
      .digest('base64url');
  return (request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'private, no-store');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin &&
      request.headers.origin !== config.webOrigin
    ) {
      next(
        new ApiError(
          403,
          'ORIGIN_NOT_ALLOWED',
          'Request origin is not allowed.',
        ),
      );
      return;
    }
    const token = request.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('mittus_session='))
      ?.slice('mittus_session='.length);
    const [id, expiration, signature, extra] = token?.split('.') ?? [];
    const payload = `${id}.${expiration}`;
    const expected = sign(payload);
    const now = Math.floor(clock.now().getTime() / 1000);
    const valid =
      !extra &&
      !!id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        id,
      ) &&
      !!expiration &&
      /^\d+$/.test(expiration) &&
      Number(expiration) > now &&
      !!signature &&
      /^[A-Za-z0-9_-]{43}$/.test(signature) &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    let sessionId = id;
    if (!valid) {
      sessionId = randomUUID();
      const newPayload = `${sessionId}.${now + lifetimeSeconds}`;
      response.cookie('mittus_session', `${newPayload}.${sign(newPayload)}`, {
        httpOnly: true,
        secure: config.production,
        sameSite: 'lax',
        path: '/',
        maxAge: lifetimeSeconds * 1000,
      });
    }
    (request as SessionRequest).sessionId = sessionId;
    next();
  };
}
