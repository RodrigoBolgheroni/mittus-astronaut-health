import 'reflect-metadata';
import { createHmac, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup.js';
import { testDatabaseUrl } from './database/prepare.js';

describe('Check-ins API with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let now = new Date('2026-11-14T23:59:59.000Z');
  const sessionIds = new Set<string>();
  const secret = 'test-only-session-secret-with-at-least-32-characters';
  const payload = {
    sleep_hours: 7.5,
    stress_level: 2,
    mood_level: 1,
    team_conflict_level: 1,
    fatigue: 3,
  };
  const today = '2026-11-14';
  const path = `/api/check-ins/${today}`;

  const trackCookie = (cookie: string) => {
    sessionIds.add(cookie.split('=')[1].split('.')[0]);
    return cookie;
  };
  async function session() {
    const response = await request(app.getHttpServer())
      .get('/api/check-ins')
      .expect(200);
    return trackCookie(
      (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
    );
  }
  const get = (cookie: string, url = '/api/check-ins') =>
    request(app.getHttpServer()).get(url).set('Cookie', cookie);
  const put = (cookie: string, data: unknown = payload, url = path) =>
    request(app.getHttpServer())
      .put(url)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(data));

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl();
    process.env.SESSION_SECRET = secret;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.NODE_ENV = 'test';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({
        now: () => new Date(now),
        today: () => now.toISOString().slice(0, 10),
      })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(() => {
    now = new Date('2026-11-14T23:59:59.000Z');
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    if (prisma)
      await prisma.checkIn.deleteMany({
        where: { sessionId: { in: [...sessionIds] } },
      });
    if (app) await app.close();
  });

  it('establishes a private cookie and does not renew an existing session', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/check-ins')
      .expect(200);
    const setCookie = (
      response.headers['set-cookie'] as unknown as string[]
    )[0];
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).toContain('Path=/');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual({ items: [], today, timezone: 'UTC' });
    const cookie = trackCookie(setCookie.split(';')[0]);
    const second = await get(cookie).expect(200);
    expect(second.headers['set-cookie']).toBeUndefined();
  });

  it('creates, reloads and replaces a check-in, preserving identity and creation time', async () => {
    const cookie = await session();
    const created = await put(cookie, {
      ...payload,
      description: '  Ready.  ',
    }).expect(200);
    expect(created.body).toMatchObject({
      ...payload,
      description: 'Ready.',
      check_in_date: today,
    });
    expect(created.body.session_id).toBeUndefined();
    expect(typeof created.body.sleep_hours).toBe('number');
    expect((await get(cookie, path).expect(200)).body).toEqual(created.body);
    await setTimeout(10);
    const updated = await put(cookie, { ...payload, fatigue: 7 }).expect(200);
    expect(updated.body).toMatchObject({
      id: created.body.id,
      created_at: created.body.created_at,
      fatigue: 7,
      description: null,
    });
    expect(updated.body.updated_at > created.body.updated_at).toBe(true);
    expect((await get(cookie).expect(200)).body.items).toHaveLength(1);
  });

  it('keeps sessions isolated on reads and writes for the same date', async () => {
    const a = await session();
    const b = await session();
    await put(a).expect(200);
    await get(b, path).expect(404);
    expect((await get(b).expect(200)).body.items).toEqual([]);
    await put(b, { ...payload, fatigue: 6 }).expect(200);
    expect((await get(a, path).expect(200)).body.fatigue).toBe(3);
    expect((await get(b, path).expect(200)).body.fatigue).toBe(6);
  });

  it.each(['tampered', 'expired', 'uuid', 'unicode'])(
    'replaces a %s cookie without recovering previous history',
    async (variant) => {
      const cookie = await session();
      await put(cookie).expect(200);
      let invalid = `${cookie}x`;
      if (variant === 'expired') {
        const id = cookie.split('=')[1].split('.')[0];
        const data = `${id}.${Math.floor(now.getTime() / 1000) - 1}`;
        invalid = `mittus_session=${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
      }
      if (variant === 'uuid') invalid = `mittus_session=${randomUUID()}`;
      if (variant === 'unicode')
        invalid =
          cookie.split('.').slice(0, -1).join('.') + '.' + 'é'.repeat(43);
      const response = await get(invalid).expect(200);
      trackCookie(
        (response.headers['set-cookie'] as unknown as string[])[0].split(
          ';',
        )[0],
      );
      expect(response.body.items).toEqual([]);
    },
  );

  it('accepts valid numeric limits and empty or null descriptions', async () => {
    const cookie = await session();
    await put(cookie, {
      sleep_hours: 0,
      stress_level: 1,
      mood_level: 1,
      team_conflict_level: 1,
      fatigue: 1,
      description: null,
    }).expect(200);
    const response = await put(cookie, {
      sleep_hours: 24,
      stress_level: 5,
      mood_level: 5,
      team_conflict_level: 5,
      fatigue: 7,
      description: '   ',
    }).expect(200);
    expect(response.body.description).toBeNull();
    await put(cookie, {
      ...payload,
      sleep_hours: 0.29,
      description: 'x'.repeat(2000),
    }).expect(200);
  });

  it.each([
    { fatigue: 0 },
    { fatigue: 8 },
    { fatigue: 2.5 },
    { fatigue: '3' },
    { fatigue: true },
    { fatigue: null },
    { mood_level: 6 },
    { stress_level: [] },
    { team_conflict_level: {} },
    { sleep_hours: -1 },
    { sleep_hours: 25 },
    { sleep_hours: 7.123 },
    { session_id: randomUUID() },
    { id: randomUUID() },
    { created_at: today },
    { description: 123 },
    { description: 'x'.repeat(2001) },
  ])('rejects invalid fields: %j', async (changes) => {
    const response = await put(await session(), {
      ...payload,
      ...changes,
    }).expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects missing indicators, arrays, and malformed JSON', async () => {
    const cookie = await session();
    const { fatigue: _fatigue, ...incomplete } = payload;
    await put(cookie, incomplete).expect(400);
    await put(cookie, []).expect(400);
    const response = await request(app.getHttpServer())
      .put(path)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '14-11-2026',
    '2026-1-01',
    '0000-01-01',
  ])('rejects invalid date %s', async (date) => {
    await get(await session(), `/api/check-ins/${date}`).expect(400);
  });

  it('only writes today in UTC and handles midnight rollover', async () => {
    const cookie = await session();
    await put(cookie, payload, '/api/check-ins/2026-11-13').expect(422);
    await put(cookie, payload, '/api/check-ins/2026-11-15').expect(422);
    await put(cookie).expect(200);
    now = new Date('2026-11-15T00:00:00.000Z');
    await put(cookie).expect(422);
    await put(cookie, payload, '/api/check-ins/2026-11-15').expect(200);
    expect((await get(cookie).expect(200)).body.today).toBe('2026-11-15');
    await get(cookie, '/api/check-ins/2099-01-01').expect(404);
  });

  it('orders recent history and returns an inclusive-start, exclusive-end calendar range', async () => {
    const cookie = await session();
    for (const day of ['2026-11-12', '2026-11-13', today]) {
      now = new Date(`${day}T12:00:00Z`);
      await put(cookie, payload, `/api/check-ins/${day}`).expect(200);
    }
    const recent = await get(cookie, '/api/check-ins?limit=2').expect(200);
    expect(
      recent.body.items.map(
        (item: { check_in_date: string }) => item.check_in_date,
      ),
    ).toEqual([today, '2026-11-13']);
    const calendar = await get(
      cookie,
      '/api/check-ins?from=2026-11-12&to=2026-11-14',
    ).expect(200);
    expect(
      calendar.body.items.map(
        (item: { check_in_date: string }) => item.check_in_date,
      ),
    ).toEqual(['2026-11-12', '2026-11-13']);
  });

  it.each([
    'limit=0',
    'limit=91',
    'limit=1.5',
    'limit=1&limit=2',
    'from=2026-11-01',
    'to=2026-12-01',
    'from=2026-11-01&to=2026-11-01',
    'from=2026-11-02&to=2026-11-01',
    'from=2026-01-01&to=2028-01-01',
    'from=2026-11-01&to=2026-12-01&limit=7',
    'foo=1',
  ])('rejects invalid query %s', async (query) => {
    await get(await session(), `/api/check-ins?${query}`).expect(400);
  });

  it('handles concurrent writes with a single persisted record', async () => {
    const cookie = await session();
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        put(cookie, { ...payload, fatigue: (i % 7) + 1 }),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array(12).fill(200),
    );
    const records = (await get(cookie).expect(200)).body.items;
    expect(records).toHaveLength(1);
    expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
  });

  it('returns scale labels from the database, ordered by value', async () => {
    const response = await get(await session(), '/api/check-in-options').expect(
      200,
    );
    for (const [key, count] of Object.entries({
      stress_level: 5,
      mood_level: 5,
      team_conflict_level: 5,
      fatigue: 7,
    })) {
      expect(
        response.body[key].map((item: { value: number }) => item.value),
      ).toEqual(Array.from({ length: count }, (_, i) => i + 1));
    }
    expect(response.body.team_conflict_level[4].label).toBe(
      'Very high team conflict',
    );
  });

  it('validates browser origins and supports credentialed CORS', async () => {
    const cookie = await session();
    await request(app.getHttpServer())
      .put(path)
      .set('Cookie', cookie)
      .set('Origin', 'https://other.example')
      .send(payload)
      .expect(403);
    const allowed = await request(app.getHttpServer())
      .put(path)
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .send(payload)
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    await request(app.getHttpServer())
      .options(path)
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'PUT')
      .expect(204);
  });

  it('uses the default Nest response for unexpected failures', async () => {
    const cookie = await session();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    vi.spyOn(prisma.checkIn, 'findMany').mockRejectedValueOnce(
      new Error('Unexpected database failure'),
    );
    const response = await get(cookie).expect(500);
    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
  });
});
