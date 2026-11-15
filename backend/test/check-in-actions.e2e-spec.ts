import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { ForecastService } from '../src/forecast/forecast.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup.js';
import { testDatabaseUrl } from './database/prepare.js';

type ForecastResult =
  | {
      status: 'ready';
      probability_high_fatigue: number;
      model_version: string;
      predicted_at: string;
    }
  | { status: 'insufficient_history' | 'unavailable' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Check-in actions API with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let now = new Date('2030-11-14T12:00:00.000Z');
  const sessionIds = new Set<string>();
  const today = '2030-11-14';
  const payload = {
    sleep_hours: 7.5,
    stress_level: 2,
    mood_level: 1,
    team_conflict_level: 1,
    fatigue: 3,
  };
  const ready = (
    probability = 0.7,
    model = 'acceptance-model-v1',
  ): ForecastResult => ({
    status: 'ready',
    probability_high_fatigue: probability,
    model_version: model,
    predicted_at: '2030-11-14T12:00:00.000Z',
  });
  let infer: () => Promise<ForecastResult>;
  const forecast = { predict: () => infer() };

  const evaluate = (cookie: string, checkInId: string, body: unknown = {}) =>
    request(app.getHttpServer())
      .post(`/api/check-ins/${checkInId}/actions/evaluate`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body));
  const list = (cookie: string, checkInId: string) =>
    request(app.getHttpServer())
      .get(`/api/check-ins/${checkInId}/actions`)
      .set('Cookie', cookie);
  const patch = (cookie: string, actionId: string, body: unknown) =>
    request(app.getHttpServer())
      .patch(`/api/check-in-actions/${actionId}`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body));
  const put = (cookie: string, body: unknown = payload, day = today) =>
    request(app.getHttpServer())
      .put(`/api/check-ins/${day}`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body));

  async function session() {
    const response = await request(app.getHttpServer())
      .get('/api/check-ins')
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies[0].split(';')[0];
    sessionIds.add(cookie.split('=')[1].split('.')[0]);
    return cookie;
  }
  async function fixture() {
    const cookie = await session();
    const response = await put(cookie).expect(200);
    return { cookie, checkInId: response.body.id as string };
  }
  async function createAction() {
    const fixtureData = await fixture();
    const response = await evaluate(
      fixtureData.cookie,
      fixtureData.checkInId,
    ).expect(200);
    expect(response.body.status).toBe('ready');
    return { ...fixtureData, actionId: response.body.action.id as string };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl();
    process.env.SESSION_SECRET =
      'test-only-session-secret-with-at-least-32-characters';
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.NODE_ENV = 'test';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({
        now: () => new Date(now),
        today: () => now.toISOString().slice(0, 10),
      })
      .overrideProvider(ForecastService)
      .useValue(forecast)
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => {
    now = new Date('2030-11-14T12:00:00.000Z');
    infer = async () => ready();
  });
  afterEach(async () => {
    if (prisma) {
      await prisma.checkIn.deleteMany({
        where: { sessionId: { in: [...sessionIds] } },
      });
    }
    sessionIds.clear();
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it.each([
    [0.49, 'monitor'],
    [0.5, 'recheck'],
  ] as const)(
    'persists the demo action for probability %s without exposing session data',
    async (probability, code) => {
      infer = async () => ready(probability);
      const { cookie, checkInId } = await fixture();
      const response = await evaluate(cookie, checkInId).expect(200);
      expect(response.body).toMatchObject({
        status: 'ready',
        explanation: expect.any(String),
        action: {
          check_in_id: checkInId,
          action_code: code,
          ruleset_version: 'demo-follow-up-v1',
          status: 'suggested',
          acknowledged_at: null,
          resolved_at: null,
          forecast_snapshot: {
            probability_high_fatigue: probability,
            model_version: 'acceptance-model-v1',
            predicted_at: '2030-11-14T12:00:00.000Z',
          },
        },
      });
      expect(Object.keys(response.body.action).sort()).toEqual([
        'acknowledged_at',
        'action_code',
        'check_in_id',
        'created_at',
        'evaluation_key',
        'forecast_snapshot',
        'id',
        'reason_code',
        'resolved_at',
        'ruleset_version',
        'status',
      ]);
      expect(response.body.action.evaluation_key).not.toBe('');
      expect(response.body.action.reason_code).not.toBe('');
      const row = await prisma.checkInAction.findUniqueOrThrow({
        where: { id: response.body.action.id },
      });
      expect(row.checkInId).toBe(checkInId);
      expect(row.forecastSnapshot).toEqual(
        response.body.action.forecast_snapshot,
      );
      expect((await list(cookie, checkInId).expect(200)).body.actions).toEqual([
        response.body.action,
      ]);
    },
  );

  it('accepts an omitted evaluation body and persists one row for repeat and simultaneous evaluations', async () => {
    const { cookie, checkInId } = await fixture();
    const first = await request(app.getHttpServer())
      .post(`/api/check-ins/${checkInId}/actions/evaluate`)
      .set('Cookie', cookie)
      .expect(200);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => evaluate(cookie, checkInId).expect(200)),
    );
    expect(responses.map((response) => response.body.action.id)).toEqual(
      Array(5).fill(first.body.action.id),
    );
    expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(1);
  });

  it('does not duplicate a first evaluation when inference requests overlap', async () => {
    const { cookie, checkInId } = await fixture();
    const gate = deferred<ForecastResult>();
    const entered = deferred<void>();
    infer = () => {
      entered.resolve();
      return gate.promise;
    };
    const first = evaluate(cookie, checkInId).then((response) => response);
    const second = evaluate(cookie, checkInId).then((response) => response);
    await entered.promise;
    gate.resolve(ready());
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[0].body.action.id).toBe(responses[1].body.action.id);
    expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(1);
  });

  it('supersedes pending model/history evaluations, lists newest first, and preserves terminal history', async () => {
    const { cookie, checkInId, actionId } = await createAction();
    now = new Date('2030-11-14T12:01:00.000Z');
    infer = async () => ready(0.2, 'acceptance-model-v2');
    const second = await evaluate(cookie, checkInId).expect(200);
    expect(second.body.action.id).not.toBe(actionId);
    const original = await prisma.checkInAction.findUniqueOrThrow({
      where: { id: actionId },
    });
    expect(original.status).toBe('superseded');
    expect(original.resolvedAt?.toISOString()).toBe(now.toISOString());
    await patch(cookie, second.body.action.id, { status: 'completed' }).expect(
      200,
    );
    now = new Date('2030-11-14T12:02:00.000Z');
    await put(cookie, { ...payload, fatigue: 6 }).expect(200);
    const third = await evaluate(cookie, checkInId).expect(200);
    expect(third.body.action.evaluation_key).not.toBe(
      second.body.action.evaluation_key,
    );
    const rows = (await list(cookie, checkInId).expect(200)).body.actions;
    expect(rows.map((row: { id: string }) => row.id)).toEqual([
      third.body.action.id,
      second.body.action.id,
      actionId,
    ]);
    expect(rows.map((row: { status: string }) => row.status)).toEqual([
      'suggested',
      'completed',
      'superseded',
    ]);
    now = new Date('2030-11-14T12:03:00.000Z');
    await put(cookie, { ...payload, fatigue: 7 }).expect(200);
    const fourth = await evaluate(cookie, checkInId).expect(200);
    expect(fourth.body.action.id).not.toBe(third.body.action.id);
    expect(
      (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: third.body.action.id },
        })
      ).status,
    ).toBe('superseded');
    expect(
      (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: second.body.action.id },
        })
      ).status,
    ).toBe('completed');
  });

  it.each(['completed', 'dismissed'] as const)(
    'acknowledges then resolves as %s with stable timestamps and terminal conflicts',
    async (status) => {
      const { cookie, checkInId, actionId } = await createAction();
      now = new Date('2030-11-14T12:01:00.000Z');
      const acknowledged = await patch(cookie, actionId, {
        status: 'acknowledged',
      }).expect(200);
      expect(acknowledged.body.acknowledged_at).toBe(now.toISOString());
      expect(acknowledged.body.resolved_at).toBeNull();
      now = new Date('2030-11-14T12:02:00.000Z');
      expect(
        (await patch(cookie, actionId, { status: 'acknowledged' }).expect(200))
          .body,
      ).toEqual(acknowledged.body);
      const resolved = await patch(cookie, actionId, { status }).expect(200);
      expect(resolved.body.status).toBe(status);
      expect(resolved.body.acknowledged_at).toBe(
        acknowledged.body.acknowledged_at,
      );
      expect(resolved.body.resolved_at).toBe(now.toISOString());
      now = new Date('2030-11-14T12:03:00.000Z');
      expect(
        (await patch(cookie, actionId, { status }).expect(200)).body,
      ).toEqual(resolved.body);
      for (const other of [
        'acknowledged',
        status === 'completed' ? 'dismissed' : 'completed',
      ]) {
        const response = await patch(cookie, actionId, {
          status: other,
        }).expect(409);
        expect(response.body.code).toBe('ACTION_NOT_PENDING');
      }
      expect(
        (await evaluate(cookie, checkInId).expect(200)).body.action,
      ).toEqual(resolved.body);
      expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(
        1,
      );
    },
  );

  it.each(['completed', 'dismissed'] as const)(
    'allows direct %s without inventing an acknowledgement',
    async (status) => {
      const { cookie, actionId } = await createAction();
      now = new Date('2030-11-14T12:01:00.000Z');
      const response = await patch(cookie, actionId, { status }).expect(200);
      expect(response.body.acknowledged_at).toBeNull();
      expect(response.body.resolved_at).toBe(now.toISOString());
      const row = await prisma.checkInAction.findUniqueOrThrow({
        where: { id: actionId },
      });
      expect(row.status).toBe(status);
      expect(row.resolvedAt?.toISOString()).toBe(now.toISOString());
    },
  );

  it.each(['insufficient_history', 'unavailable'] as const)(
    'returns %s without a fake snapshot and supersedes pending actions',
    async (status) => {
      const { cookie, checkInId, actionId } = await createAction();
      const snapshot = (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: actionId },
        })
      ).forecastSnapshot;
      await patch(cookie, actionId, { status: 'acknowledged' }).expect(200);
      infer = async () => ({ status });
      now = new Date('2030-11-14T12:01:00.000Z');
      const response = await evaluate(cookie, checkInId).expect(200);
      expect(response.body).toEqual({
        status,
        action: null,
        explanation: expect.any(String),
      });
      const row = await prisma.checkInAction.findUniqueOrThrow({
        where: { id: actionId },
      });
      expect(row.status).toBe('superseded');
      expect(row.resolvedAt?.toISOString()).toBe(now.toISOString());
      expect(row.forecastSnapshot).toEqual(snapshot);
      expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(
        1,
      );
      expect(
        (await patch(cookie, actionId, { status: 'completed' }).expect(409))
          .body.code,
      ).toBe('ACTION_NOT_PENDING');
      const fresh = await fixture();
      expect(
        (await evaluate(fresh.cookie, fresh.checkInId).expect(200)).body.action,
      ).toBeNull();
      expect(
        await prisma.checkInAction.count({
          where: { checkInId: fresh.checkInId },
        }),
      ).toBe(0);
    },
  );

  it('creates a fresh action after inference recovers without reviving the superseded row', async () => {
    const { cookie, checkInId, actionId } = await createAction();
    infer = async () => ({ status: 'unavailable' });
    await evaluate(cookie, checkInId).expect(200);
    infer = async () => ready();
    const recovered = await evaluate(cookie, checkInId).expect(200);
    expect(recovered.body.action.id).not.toBe(actionId);
    expect(recovered.body.action.status).toBe('suggested');
    expect((await evaluate(cookie, checkInId).expect(200)).body.action.id).toBe(
      recovered.body.action.id,
    );
    expect(
      (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: actionId },
        })
      ).status,
    ).toBe('superseded');
    expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(2);
    await patch(cookie, recovered.body.action.id, {
      status: 'completed',
    }).expect(200);
  });

  it('invalidates pending actions on indicator corrections and permits returning to earlier values', async () => {
    const { cookie, checkInId, actionId } = await createAction();
    await put(cookie, { ...payload, fatigue: 6 }).expect(200);
    expect(
      (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: actionId },
        })
      ).status,
    ).toBe('superseded');
    const revised = await evaluate(cookie, checkInId).expect(200);
    await put(cookie, payload).expect(200);
    const restored = await evaluate(cookie, checkInId).expect(200);
    expect(restored.body.action.id).not.toBe(actionId);
    expect(restored.body.action.id).not.toBe(revised.body.action.id);
    expect(
      (await list(cookie, checkInId).expect(200)).body.actions.map(
        (row: { status: string }) => row.status,
      ),
    ).toEqual(['suggested', 'superseded', 'superseded']);
  });

  it('rejects a stale in-flight forecast after a check-in edit without writing an action', async () => {
    const { cookie, checkInId } = await fixture();
    const entered = deferred<void>();
    const gate = deferred<ForecastResult>();
    infer = () => {
      entered.resolve();
      return gate.promise;
    };
    const pending = evaluate(cookie, checkInId).then((response) => response);
    await entered.promise;
    try {
      now = new Date('2030-11-14T12:01:00.000Z');
      await put(cookie, { ...payload, fatigue: 6 }).expect(200);
    } finally {
      gate.resolve(ready());
    }
    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EVALUATION_OUTDATED');
    expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(0);
  });

  it('rejects evaluation of a check-in that is not the latest while retaining its action history', async () => {
    const { cookie, checkInId, actionId } = await createAction();
    now = new Date('2030-11-15T12:00:00.000Z');
    await put(cookie, payload, '2030-11-15').expect(200);
    const response = await evaluate(cookie, checkInId).expect(409);
    expect(response.body.code).toBe('CHECK_IN_NOT_LATEST');
    expect((await list(cookie, checkInId).expect(200)).body.actions[0].id).toBe(
      actionId,
    );
    expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(1);
  });

  it('returns 404 for missing or foreign check-ins/actions and isolates signed sessions', async () => {
    const owner = await createAction();
    const foreignCookie = await session();
    for (const checkInId of [owner.checkInId, randomUUID()]) {
      await evaluate(foreignCookie, checkInId).expect(404);
      await list(foreignCookie, checkInId).expect(404);
    }
    for (const actionId of [owner.actionId, randomUUID()]) {
      await patch(foreignCookie, actionId, { status: 'completed' }).expect(404);
    }
    const missing = randomUUID();
    await evaluate(owner.cookie, missing).expect(404);
    await list(owner.cookie, missing).expect(404);
    await patch(owner.cookie, missing, { status: 'dismissed' }).expect(404);
    const tamperedCookie =
      owner.cookie.slice(0, -1) + (owner.cookie.endsWith('a') ? 'b' : 'a');
    const response = await list(tamperedCookie, owner.checkInId).expect(404);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    if (cookies)
      sessionIds.add(cookies[0].split(';')[0].split('=')[1].split('.')[0]);
    expect(
      (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: owner.actionId },
        })
      ).status,
    ).toBe('suggested');
  });

  it('rejects invalid UUIDs, unknown fields, client-controlled statuses, and malformed bodies', async () => {
    const { cookie, checkInId, actionId } = await createAction();
    await evaluate(cookie, 'not-a-uuid').expect(400);
    await list(cookie, 'not-a-uuid').expect(400);
    await patch(cookie, 'not-a-uuid', { status: 'completed' }).expect(400);
    for (const body of [
      { status: 'completed' },
      { probability_high_fatigue: 1 },
      [],
      null,
    ]) {
      await evaluate(cookie, checkInId, body).expect(400);
    }
    for (const body of [
      {},
      { status: 'suggested' },
      { status: 'superseded' },
      { status: 'contact_medical' },
      { status: 'COMPLETE' },
      { status: null },
      { status: 1 },
      { status: 'completed', resolved_at: now.toISOString() },
      [],
      null,
    ]) {
      await patch(cookie, actionId, body).expect(400);
    }
    await request(app.getHttpServer())
      .post(`/api/check-ins/${checkInId}/actions/evaluate`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(1);
    expect(
      (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: actionId },
        })
      ).status,
    ).toBe('suggested');
  });

  it('keeps the current action when only the description changes or an identical check-in is saved', async () => {
    const { cookie, checkInId, actionId } = await createAction();
    now = new Date('2030-11-14T12:01:00.000Z');
    await put(cookie, {
      ...payload,
      description: 'A private note, not a predictor input.',
    }).expect(200);
    expect(
      (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: actionId },
        })
      ).status,
    ).toBe('suggested');
    expect((await evaluate(cookie, checkInId).expect(200)).body.action.id).toBe(
      actionId,
    );
    now = new Date('2030-11-14T12:02:00.000Z');
    await put(cookie, {
      ...payload,
      description: 'A private note, not a predictor input.',
    }).expect(200);
    expect((await evaluate(cookie, checkInId).expect(200)).body.action.id).toBe(
      actionId,
    );
    expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(1);
  });

  it('rejects unauthorized browser origins for evaluation and status updates', async () => {
    const { cookie, checkInId, actionId } = await createAction();
    await request(app.getHttpServer())
      .post(`/api/check-ins/${checkInId}/actions/evaluate`)
      .set('Cookie', cookie)
      .set('Origin', 'https://other.example')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/check-in-actions/${actionId}`)
      .set('Cookie', cookie)
      .set('Origin', 'https://other.example')
      .send({ status: 'completed' })
      .expect(403);
    expect(
      (
        await prisma.checkInAction.findUniqueOrThrow({
          where: { id: actionId },
        })
      ).status,
    ).toBe('suggested');
  });
});
