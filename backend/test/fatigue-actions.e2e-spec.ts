import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { predictFatigue } from '@mittus/fatigue-model';
import type { FatigueCheckIn } from '@mittus/fatigue-model';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/common/clock.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup.js';
import { testDatabaseUrl } from './database/prepare.js';

const today = new Date('2030-11-14T00:00:00.000Z');
const dayMilliseconds = 86_400_000;

describe('Check-in actions with the bundled fatigue model', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sessionIds = new Set<string>();

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', testDatabaseUrl());
    vi.stubEnv(
      'SESSION_SECRET',
      'local-model-test-secret-at-least-32-characters',
    );
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('FATIGUE_FORECAST_URL', undefined);
    vi.stubEnv('NODE_ENV', 'test');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({ now: () => new Date(today), today: () => '2030-11-14' })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma)
      await prisma.checkIn.deleteMany({
        where: { sessionId: { in: [...sessionIds] } },
      });
    if (app) await app.close();
    vi.unstubAllEnvs();
  });

  async function session() {
    const response = await request(app.getHttpServer())
      .get('/api/check-ins')
      .expect(200);
    const cookies = response.headers['set-cookie'];
    if (!Array.isArray(cookies) || typeof cookies[0] !== 'string')
      throw new Error('Missing session cookie.');
    const cookie = cookies[0].split(';')[0];
    sessionIds.add(cookie.split('=')[1]!.split('.')[0]!);
    return cookie;
  }

  async function insertHistory(
    cookie: string,
    observations: readonly FatigueCheckIn[],
  ) {
    const sessionId = cookie.split('=')[1]!.split('.')[0]!;
    await prisma.checkIn.createMany({
      data: observations.map((observation, index) => ({
        sessionId,
        checkInDate: new Date(
          today.getTime() - (observations.length - index - 1) * dayMilliseconds,
        ),
        sleepHours: observation.sleep_hours,
        fatigue: observation.fatigue,
        stressLevel: 1,
        moodLevel: 1,
        teamConflictLevel: 1,
      })),
    });
    return prisma.checkIn.findUniqueOrThrow({
      where: { sessionId_checkInDate: { sessionId, checkInDate: today } },
    });
  }

  const evaluate = (cookie: string, checkInId: string) =>
    request(app.getHttpServer())
      .post(`/api/check-ins/${checkInId}/actions/evaluate`)
      .set('Cookie', cookie)
      .send({});

  it('moves from insufficient history to a persisted action and preserves progress on retry', async () => {
    const cookie = await session();
    const checkIn = await insertHistory(cookie, [
      { sleep_hours: 8, fatigue: 2 },
      { sleep_hours: 7, fatigue: 3 },
    ]);
    const insufficient = await evaluate(cookie, checkIn.id).expect(200);
    expect(insufficient.body).toMatchObject({
      status: 'insufficient_history',
      action: null,
    });
    expect(
      await prisma.checkInAction.count({ where: { checkInId: checkIn.id } }),
    ).toBe(0);
    await prisma.checkIn.create({
      data: {
        sessionId: checkIn.sessionId,
        checkInDate: new Date(today.getTime() - 2 * dayMilliseconds),
        sleepHours: 8,
        fatigue: 2,
        stressLevel: 1,
        moodLevel: 1,
        teamConflictLevel: 1,
      },
    });
    const predicted = await evaluate(cookie, checkIn.id).expect(200);
    expect(predicted.body.status).toBe('ready');
    expect(
      predicted.body.action.forecast_snapshot.probability_high_fatigue,
    ).toBeGreaterThanOrEqual(0);
    expect(
      predicted.body.action.forecast_snapshot.probability_high_fatigue,
    ).toBeLessThanOrEqual(1);
    const actionId = predicted.body.action.id;
    await request(app.getHttpServer())
      .patch(`/api/check-in-actions/${actionId}`)
      .set('Cookie', cookie)
      .send({ status: 'completed' })
      .expect(200);
    const repeated = await evaluate(cookie, checkIn.id).expect(200);
    expect(repeated.body.action).toMatchObject({
      id: actionId,
      status: 'completed',
    });
    expect(
      await prisma.checkInAction.count({ where: { checkInId: checkIn.id } }),
    ).toBe(1);
  });

  it('uses the complete session history rather than truncating model inputs at ninety records', async () => {
    const cookie = await session();
    const observations = Array.from({ length: 92 }, (_, index) => ({
      sleep_hours: index < 2 ? 0 : 8,
      fatigue: index < 2 ? 7 : 2,
    }));
    const checkIn = await insertHistory(cookie, observations);
    const expected = predictFatigue(observations);
    const truncated = predictFatigue(observations.slice(-90));
    if (expected.status !== 'ok' || truncated.status !== 'ok')
      throw new Error('Expected sufficient model history.');
    const response = await evaluate(cookie, checkIn.id).expect(200);
    expect(response.body.status).toBe('ready');
    const probability =
      response.body.action.forecast_snapshot.probability_high_fatigue;
    expect(probability).toBeCloseTo(expected.probability_high_fatigue, 12);
    expect(probability).not.toBeCloseTo(truncated.probability_high_fatigue, 12);
  });

  it('keeps high- and low-fatigue session histories isolated when generating actual model actions', async () => {
    const highCookie = await session();
    const lowCookie = await session();
    const high = await insertHistory(
      highCookie,
      Array.from({ length: 3 }, () => ({ sleep_hours: 0, fatigue: 7 })),
    );
    const low = await insertHistory(
      lowCookie,
      Array.from({ length: 3 }, () => ({ sleep_hours: 9, fatigue: 1 })),
    );
    const highResponse = await evaluate(highCookie, high.id).expect(200);
    const lowResponse = await evaluate(lowCookie, low.id).expect(200);
    expect(highResponse.body.action.action_code).toBe('recheck');
    expect(lowResponse.body.action.action_code).toBe('monitor');
    expect(
      highResponse.body.action.forecast_snapshot.probability_high_fatigue,
    ).toBeGreaterThan(
      lowResponse.body.action.forecast_snapshot.probability_high_fatigue,
    );
    await evaluate(lowCookie, high.id).expect(404);
  });
});
