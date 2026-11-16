import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { ForecastService } from '../src/forecast/forecast.service.js';
import type { ForecastResult } from '../src/forecast/dto/forecast-result.js';
import type { ForecastCheckIn } from '../src/forecast/dto/forecast-check-in.js';
import { CeresService } from '../src/recommendations/ceres.service.js';
import type { GeneratedRecommendation } from '../src/recommendations/dto/recommendation.output.js';
import type { EvaluateCheckInActionsOutput } from '../src/check-in-actions/dto/check-in-action.output.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup.js';
import { testDatabaseUrl } from './database/prepare.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function forecastTask(plan: EvaluateCheckInActionsOutput) {
  const task = plan.actions.find((action) => action.source === 'forecast');
  if (!task) throw new Error('Expected a forecast-sourced task.');
  return task;
}

describe('Persisted check-in plan API with PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let now = new Date('2030-11-14T12:00:00.000Z');
  const sessionIds = new Set<string>();
  const today = '2030-11-14';
  const payload = { sleep_hours: 7.5, stress_level: 2, mood_level: 1, team_conflict_level: 1, fatigue: 3 };
  const ready = (probability = 0.7, model = 'acceptance-model-v1'): ForecastResult => ({
    status: 'ready', probability_high_fatigue: probability, model_version: model, predicted_at: now.toISOString(),
  });
  let infer: () => Promise<ForecastResult>;
  const recommend = vi.fn(async (_history: ForecastCheckIn[], _forecast: ForecastResult): Promise<GeneratedRecommendation | null> => null);
  const evaluate = (cookie: string, id: string, body: unknown = {}) =>
    request(app.getHttpServer()).post(`/api/check-ins/${id}/actions/evaluate`).set('Cookie', cookie).set('Content-Type', 'application/json').send(JSON.stringify(body));
  const list = (cookie: string, id: string) =>
    request(app.getHttpServer()).get(`/api/check-ins/${id}/actions`).set('Cookie', cookie);
  const patch = (cookie: string, id: string, body: unknown) =>
    request(app.getHttpServer()).patch(`/api/check-in-actions/${id}`).set('Cookie', cookie).set('Content-Type', 'application/json').send(JSON.stringify(body));
  const put = (cookie: string, body: unknown = payload, day = today) =>
    request(app.getHttpServer()).put(`/api/check-ins/${day}`).set('Cookie', cookie).set('Content-Type', 'application/json').send(JSON.stringify(body));

  async function session() {
    const response = await request(app.getHttpServer()).get('/api/check-ins').expect(200);
    const cookies: unknown = response.headers['set-cookie'];
    if (!Array.isArray(cookies) || typeof cookies[0] !== 'string') throw new Error('Missing session cookie.');
    const cookie = cookies[0].split(';')[0]!;
    sessionIds.add(cookie.split('=')[1]!.split('.')[0]!);
    return cookie;
  }
  async function fixture() {
    const cookie = await session();
    const response = await put(cookie).expect(200);
    return { cookie, checkInId: response.body.id as string };
  }
  async function createAction() {
    const data = await fixture();
    const response = await evaluate(data.cookie, data.checkInId).expect(200);
    return { ...data, actionId: forecastTask(response.body).id, plan: response.body as EvaluateCheckInActionsOutput };
  }

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', testDatabaseUrl());
    vi.stubEnv('SESSION_SECRET', 'test-only-session-secret-with-at-least-32-characters');
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('CERES_URL', undefined);
    vi.stubEnv('FATIGUE_FORECAST_URL', undefined);
    vi.stubEnv('NODE_ENV', 'test');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock).useValue({ now: () => new Date(now), today: () => now.toISOString().slice(0, 10) })
      .overrideProvider(ForecastService).useValue({ predict: () => infer() })
      .overrideProvider(CeresService).useValue({ generate: recommend }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  beforeEach(() => {
    now = new Date('2030-11-14T12:00:00.000Z');
    infer = async () => ready();
    recommend.mockReset().mockResolvedValue(null);
  });
  afterEach(async () => {
    if (prisma) await prisma.checkIn.deleteMany({ where: { sessionId: { in: [...sessionIds] } } });
    sessionIds.clear();
  });
  afterAll(async () => { if (app) await app.close(); vi.unstubAllEnvs(); });

  it.each([[0.49, 'monitor'], [0.5, 'recheck']] as const)(
    'persists the review task and demo forecast task for probability %s',
    async (probability, code) => {
      infer = async () => ready(probability);
      const { cookie, checkInId } = await fixture();
      const response = await evaluate(cookie, checkInId).expect(200);
      const plan: EvaluateCheckInActionsOutput = response.body;
      expect(plan.insight).toMatchObject({ check_in_id: checkInId, source: 'fallback', generator: null });
      expect(plan.actions).toEqual([
        expect.objectContaining({ task_key: 'review_insight', kind: 'review_insight', source: 'check_in', forecast_snapshot: null }),
        expect.objectContaining({ action_code: code, source: 'forecast', status: 'suggested', ruleset_version: 'demo-follow-up-v1' }),
      ]);
      const task = forecastTask(plan);
      expect(task.forecast_snapshot).toEqual({
        probability_high_fatigue: probability, model_version: 'acceptance-model-v1', predicted_at: now.toISOString(),
      });
      expect(JSON.stringify(plan)).not.toContain(cookie.split('=')[1]!.split('.')[0]!);
      const rows = (await list(cookie, checkInId).expect(200)).body.actions;
      expect(rows).toEqual([...plan.actions].reverse());
      const stored = await prisma.checkInInsight.findUniqueOrThrow({ where: { id: plan.insight.id } });
      expect(stored.nextStep).toBe(plan.insight.next_step);
    },
  );

  it('persists every generated task, including tasks with the same action code, and reuses the saved result', async () => {
    recommend.mockResolvedValue({
      insight: { title: 'Recorded changes', summary: 'Review the recorded indicators.', next_step: 'Open the checklist.', facts: { sleep_hours: 7.5 }, source: 'ai', generator: 'test-generator-v1' },
      tasks: ['first', 'second'].map((task_key) => ({
        task_key, title: `Task ${task_key}`, source: 'forecast', kind: 'task', action_code: 'monitor',
        reason_code: 'record_review', ruleset_version: 'test-plan-v1',
      })),
    });
    const { cookie, checkInId } = await fixture();
    const first = await evaluate(cookie, checkInId).expect(200);
    expect(first.body.actions.map((task: { task_key: string; title: string }) => [task.task_key, task.title]))
      .toEqual([['first', 'Task first'], ['second', 'Task second']]);
    await patch(cookie, first.body.actions[0].id, { status: 'completed' }).expect(200);
    const repeat = await evaluate(cookie, checkInId).expect(200);
    expect(repeat.body.insight).toEqual(first.body.insight);
    expect(repeat.body.actions.map((task: { id: string }) => task.id)).toEqual(first.body.actions.map((task: { id: string }) => task.id));
    expect(repeat.body.actions[0].status).toBe('completed');
    expect(repeat.body.actions[1].status).toBe('suggested');
    expect(recommend).toHaveBeenCalledTimes(1);
  });

  it('accepts no body and coalesces overlapping evaluations without duplicate tasks or generation', async () => {
    const { cookie, checkInId } = await fixture();
    const entered = deferred<void>();
    const gate = deferred<GeneratedRecommendation | null>();
    recommend.mockImplementation(() => { entered.resolve(); return gate.promise; });
    const first = request(app.getHttpServer()).post(`/api/check-ins/${checkInId}/actions/evaluate`).set('Cookie', cookie).then((r) => r);
    await entered.promise;
    const other = Array.from({ length: 5 }, () => evaluate(cookie, checkInId).then((r) => r));
    gate.resolve(null);
    const results = await Promise.all([first, ...other]);
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
    for (const result of results) expect(result.body.actions.map((a: { id: string }) => a.id)).toEqual(results[0].body.actions.map((a: { id: string }) => a.id));
    expect(recommend).toHaveBeenCalledTimes(1);
    expect(await prisma.checkInInsight.count({ where: { checkInId } })).toBe(1);
  });

  it('supersedes an entire old task set and insight while preserving completed history', async () => {
    const { cookie, checkInId, actionId, plan } = await createAction();
    await patch(cookie, actionId, { status: 'completed' }).expect(200);
    now = new Date('2030-11-14T12:01:00.000Z');
    infer = async () => ready(0.2, 'acceptance-model-v2');
    const second = await evaluate(cookie, checkInId).expect(200);
    expect(second.body.insight.id).not.toBe(plan.insight.id);
    expect((await prisma.checkInInsight.findUniqueOrThrow({ where: { id: plan.insight.id } })).supersededAt).not.toBeNull();
    expect((await prisma.checkInAction.findUniqueOrThrow({ where: { id: actionId } })).status).toBe('completed');
    expect((await prisma.checkInAction.findUniqueOrThrow({ where: { id: plan.actions[0]!.id } })).status).toBe('superseded');
    const history = (await list(cookie, checkInId).expect(200)).body.actions;
    expect(history.map((task: { id: string }) => task.id)).toEqual([
      ...second.body.actions.map((task: { id: string }) => task.id).reverse(), ...plan.actions.map((task) => task.id).reverse(),
    ]);
  });

  it.each(['completed', 'dismissed'] as const)('acknowledges then resolves a task as %s with stable timestamps', async (status) => {
    const { cookie, checkInId, actionId } = await createAction();
    now = new Date('2030-11-14T12:01:00.000Z');
    const acknowledged = await patch(cookie, actionId, { status: 'acknowledged' }).expect(200);
    expect(acknowledged.body.acknowledged_at).toBe(now.toISOString());
    expect(acknowledged.body.resolved_at).toBeNull();
    now = new Date('2030-11-14T12:02:00.000Z');
    expect((await patch(cookie, actionId, { status: 'acknowledged' }).expect(200)).body).toEqual(acknowledged.body);
    const resolved = await patch(cookie, actionId, { status }).expect(200);
    expect(resolved.body).toMatchObject({ status, acknowledged_at: acknowledged.body.acknowledged_at, resolved_at: now.toISOString() });
    now = new Date('2030-11-14T12:03:00.000Z');
    expect((await patch(cookie, actionId, { status }).expect(200)).body).toEqual(resolved.body);
    for (const other of ['acknowledged', status === 'completed' ? 'dismissed' : 'completed'])
      expect((await patch(cookie, actionId, { status: other }).expect(409)).body.code).toBe('ACTION_NOT_PENDING');
    expect(forecastTask((await evaluate(cookie, checkInId).expect(200)).body)).toEqual(resolved.body);
  });

  it.each(['completed', 'dismissed'] as const)('allows direct %s without inventing an acknowledgement', async (status) => {
    const { cookie, actionId } = await createAction();
    now = new Date('2030-11-14T12:01:00.000Z');
    const response = await patch(cookie, actionId, { status }).expect(200);
    expect(response.body).toMatchObject({ status, acknowledged_at: null, resolved_at: now.toISOString() });
  });

  it.each(['insufficient_history', 'unavailable'] as const)('keeps check-in tasks without fabricating a forecast for %s', async (status) => {
    const { cookie, checkInId, actionId } = await createAction();
    const previous = await prisma.checkInAction.findUniqueOrThrow({ where: { id: actionId } });
    infer = async () => ({ status });
    const response = await evaluate(cookie, checkInId).expect(200);
    expect(response.body.forecast).toEqual({ status });
    expect(response.body.actions).toEqual([expect.objectContaining({ source: 'check_in', forecast_snapshot: null })]);
    const old = await prisma.checkInAction.findUniqueOrThrow({ where: { id: actionId } });
    expect(old.status).toBe('superseded');
    expect(old.forecastSnapshot).toEqual(previous.forecastSnapshot);
    await patch(cookie, actionId, { status: 'completed' }).expect(409);
    const fresh = await fixture();
    expect((await evaluate(fresh.cookie, fresh.checkInId).expect(200)).body.actions)
      .toEqual([expect.objectContaining({ source: 'check_in', forecast_snapshot: null })]);
  });

  it('creates new task IDs after recovery rather than reviving superseded tasks', async () => {
    const { cookie, checkInId, actionId } = await createAction();
    infer = async () => ({ status: 'unavailable' });
    await evaluate(cookie, checkInId).expect(200);
    infer = async () => ready();
    const recovered = forecastTask((await evaluate(cookie, checkInId).expect(200)).body);
    expect(recovered.id).not.toBe(actionId);
    expect(recovered.status).toBe('suggested');
    expect(forecastTask((await evaluate(cookie, checkInId).expect(200)).body).id).toBe(recovered.id);
    expect((await prisma.checkInAction.findUniqueOrThrow({ where: { id: actionId } })).status).toBe('superseded');
  });

  it.each(['sleep_hours', 'stress_level', 'mood_level', 'team_conflict_level', 'fatigue'] as const)(
    'invalidates current insight and pending tasks when %s changes and supports restoring old values',
    async (field) => {
      const { cookie, checkInId, plan } = await createAction();
      await put(cookie, { ...payload, [field]: payload[field] + 1 }).expect(200);
      expect(await prisma.checkInInsight.count({ where: { checkInId, supersededAt: null } })).toBe(0);
      expect(await prisma.checkInAction.count({ where: { checkInId, status: { in: ['suggested', 'acknowledged'] } } })).toBe(0);
      const second = await evaluate(cookie, checkInId).expect(200);
      await put(cookie, payload).expect(200);
      const restored = await evaluate(cookie, checkInId).expect(200);
      expect(restored.body.insight.id).not.toBe(plan.insight.id);
      expect(restored.body.insight.id).not.toBe(second.body.insight.id);
      expect(await prisma.checkInInsight.count({ where: { checkInId, supersededAt: null } })).toBe(1);
    },
  );

  it.each(['forecast', 'recommendation'] as const)('rejects stale %s work after an edit without publishing a partial plan', async (stage) => {
    const { cookie, checkInId } = await fixture();
    const entered = deferred<void>();
    const prediction = deferred<ForecastResult>();
    const generation = deferred<GeneratedRecommendation | null>();
    if (stage === 'forecast') infer = () => { entered.resolve(); return prediction.promise; };
    else recommend.mockImplementation(() => { entered.resolve(); return generation.promise; });
    const pending = evaluate(cookie, checkInId).then((r) => r);
    await entered.promise;
    try { await put(cookie, { ...payload, fatigue: 6 }).expect(200); }
    finally { prediction.resolve(ready()); generation.resolve(null); }
    const result = await pending;
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('EVALUATION_OUTDATED');
    expect(await prisma.checkInInsight.count({ where: { checkInId } })).toBe(0);
    expect(await prisma.checkInAction.count({ where: { checkInId } })).toBe(0);
  });

  it('rejects old check-ins and invalidates their current plan when a new day is saved', async () => {
    const { cookie, checkInId, plan } = await createAction();
    now = new Date('2030-11-15T12:00:00.000Z');
    await put(cookie, payload, '2030-11-15').expect(200);
    expect((await evaluate(cookie, checkInId).expect(409)).body.code).toBe('CHECK_IN_NOT_LATEST');
    const history = (await list(cookie, checkInId).expect(200)).body.actions;
    expect(history.map((a: { id: string }) => a.id)).toEqual(plan.actions.map((a) => a.id).reverse());
    expect(history.every((a: { status: string }) => a.status === 'superseded')).toBe(true);
    expect(await prisma.checkInInsight.count({ where: { checkInId, supersededAt: null } })).toBe(0);
  });

  it('returns 404 for foreign or missing resources and rejects tampered sessions', async () => {
    const owner = await createAction();
    const foreign = await session();
    for (const id of [owner.checkInId, randomUUID()]) { await evaluate(foreign, id).expect(404); await list(foreign, id).expect(404); }
    for (const id of [owner.actionId, randomUUID()]) await patch(foreign, id, { status: 'completed' }).expect(404);
    await evaluate(owner.cookie, randomUUID()).expect(404);
    await patch(owner.cookie, randomUUID(), { status: 'dismissed' }).expect(404);
    const tampered = owner.cookie.slice(0, -1) + (owner.cookie.endsWith('a') ? 'b' : 'a');
    const response = await list(tampered, owner.checkInId).expect(404);
    const cookies: unknown = response.headers['set-cookie'];
    if (Array.isArray(cookies) && typeof cookies[0] === 'string') sessionIds.add(cookies[0].split(';')[0]!.split('=')[1]!.split('.')[0]!);
    expect((await prisma.checkInAction.findUniqueOrThrow({ where: { id: owner.actionId } })).status).toBe('suggested');
    expect(recommend).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed IDs, task/forecast injection and client-controlled status timestamps', async () => {
    const { cookie, checkInId, actionId, plan } = await createAction();
    await evaluate(cookie, 'not-a-uuid').expect(400);
    await list(cookie, 'not-a-uuid').expect(400);
    await patch(cookie, 'not-a-uuid', { status: 'completed' }).expect(400);
    for (const body of [{ status: 'completed' }, { tasks: [] }, { probability_high_fatigue: 1 }, [], null])
      await evaluate(cookie, checkInId, body).expect(400);
    for (const body of [{}, { status: 'suggested' }, { status: 'superseded' }, { status: 'contact_medical' }, { status: 'COMPLETE' }, { status: null }, { status: 1 }, { status: 'completed', resolved_at: now.toISOString() }, [], null])
      await patch(cookie, actionId, body).expect(400);
    await request(app.getHttpServer()).post(`/api/check-ins/${checkInId}/actions/evaluate`).set('Cookie', cookie).set('Content-Type', 'application/json').send('{').expect(400);
    expect((await evaluate(cookie, checkInId).expect(200)).body.actions).toEqual(plan.actions);
  });

  it('preserves the complete current plan on description-only and identical saves', async () => {
    const { cookie, checkInId, plan } = await createAction();
    for (let index = 0; index < 2; index++) {
      await put(cookie, { ...payload, description: 'A private note, not a model input.' }).expect(200);
      const current = await evaluate(cookie, checkInId).expect(200);
      expect(current.body.insight).toEqual(plan.insight);
      expect(current.body.actions).toEqual(plan.actions);
    }
    expect(recommend).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthorized browser origins without changing the stored plan', async () => {
    const { cookie, checkInId, actionId, plan } = await createAction();
    await request(app.getHttpServer()).post(`/api/check-ins/${checkInId}/actions/evaluate`).set('Cookie', cookie).set('Origin', 'https://other.example').send({}).expect(403);
    await request(app.getHttpServer()).patch(`/api/check-in-actions/${actionId}`).set('Cookie', cookie).set('Origin', 'https://other.example').send({ status: 'completed' }).expect(403);
    expect((await evaluate(cookie, checkInId).expect(200)).body.actions).toEqual(plan.actions);
  });
});
