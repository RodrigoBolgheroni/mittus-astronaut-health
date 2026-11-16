import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.js';
import prepareDatabase, { testDatabaseUrl } from './database/prepare.js';

// These tests run against the SQL history, not a schema synthesized by Prisma.
describe('Replayed database contract', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads the seeded mission with both legs, places and nullable departure facts', async () => {
    const mission = await prisma.mission.findUniqueOrThrow({
      where: { code: 'demo-crew-12' },
      include: {
        legs: { include: { departurePlace: true, destinationPlace: true } },
      },
    });
    expect(mission.isDemo).toBe(true);
    expect(mission.ll2LaunchId).toBe('862b54e3-7bf8-48e5-8cd1-d77257d5fde9');
    const orbit = mission.legs.find((leg) => leg.phase === 'in_orbit');
    expect(orbit?.departurePlace.code).toBe('cape_canaveral_slc_40');
    expect(orbit?.departureAt?.toISOString()).toBe('2026-02-13T10:15:56.000Z');
    expect(orbit?.destinationPlace).toMatchObject({
      code: 'iss',
      kind: 'tracked',
      trackedObject: 'iss',
      latitude: null,
      longitude: null,
    });
    const returning = mission.legs.find(
      (leg) => leg.phase === 'return_to_earth',
    );
    expect(returning?.departureAt).toBeNull();
    expect(returning?.departureAtSource).toBeNull();
    expect(returning?.destinationPlace).toMatchObject({
      code: 'pacific_splashdown_california',
      kind: 'fixed',
      simulated: true,
    });
  });

  it('allows multiple non-demo missions and cascades owned links without deleting shared places', async () => {
    await prisma.$transaction(async (transaction) => {
      const departure = await transaction.missionPlace.findUniqueOrThrow({
        where: { code: 'iss' },
      });
      const destination = await transaction.missionPlace.findUniqueOrThrow({
        where: { code: 'pacific_splashdown_california' },
      });
      const mission = await transaction.mission.create({
        data: { code: `test-${randomUUID()}`, name: 'Contract test mission' },
      });
      const other = await transaction.mission.create({
        data: {
          code: `test-${randomUUID()}`,
          name: 'Another contract test mission',
        },
      });
      const sessionId = randomUUID();
      await transaction.missionLeg.create({
        data: {
          missionId: mission.id,
          phase: 'return_to_earth',
          departurePlaceId: departure.id,
          destinationPlaceId: destination.id,
          destinationDescription: 'Simulated return leg.',
        },
      });
      await transaction.sessionMission.create({
        data: { sessionId, missionId: mission.id },
      });
      const link = await transaction.sessionMission.findUniqueOrThrow({
        where: { sessionId },
        include: { mission: { include: { legs: true } } },
      });
      expect(link.mission.legs[0]).toMatchObject({
        missionId: mission.id,
        phase: 'return_to_earth',
      });
      await transaction.mission.delete({ where: { id: mission.id } });
      expect(
        await transaction.sessionMission.findUnique({ where: { sessionId } }),
      ).toBeNull();
      expect(
        await transaction.missionLeg.findUnique({
          where: {
            missionId_phase: {
              missionId: mission.id,
              phase: 'return_to_earth',
            },
          },
        }),
      ).toBeNull();
      expect(
        (
          await transaction.missionPlace.findUniqueOrThrow({
            where: { id: destination.id },
          })
        ).code,
      ).toBe(destination.code);
      await transaction.mission.delete({ where: { id: other.id } });
    });
  });

  it('enforces SQL-only demo uniqueness, place shapes and one mission per session', async () => {
    await prisma.$executeRawUnsafe(`DO $$
    DECLARE
      test_id uuid;
      test_session uuid := gen_random_uuid();
      demo_id uuid;
    BEGIN
      SELECT id INTO STRICT demo_id FROM public.missions WHERE code = 'demo-crew-12';
      BEGIN
        INSERT INTO public.missions (code, name, is_demo)
          VALUES ('test-' || gen_random_uuid(), 'Invalid second demo', true);
        RAISE EXCEPTION 'A second demo mission was accepted';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      BEGIN
        INSERT INTO public.mission_places (code, name, label, kind)
          VALUES ('test_' || replace(gen_random_uuid()::text, '-', '_'), 'Invalid place', 'Invalid tracked place', 'tracked');
        RAISE EXCEPTION 'A tracked place without an object was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      INSERT INTO public.missions (code, name) VALUES ('test-' || gen_random_uuid(), 'Session contract') RETURNING id INTO test_id;
      INSERT INTO public.session_missions (session_id, mission_id) VALUES (test_session, test_id);
      BEGIN
        INSERT INTO public.session_missions (session_id, mission_id) VALUES (test_session, demo_id);
        RAISE EXCEPTION 'A second mission link for a session was accepted';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      BEGIN
        INSERT INTO public.session_missions (session_id, mission_id) VALUES (gen_random_uuid(), gen_random_uuid());
        RAISE EXCEPTION 'An orphan session mission was accepted';
      EXCEPTION WHEN foreign_key_violation THEN NULL;
      END;
      DELETE FROM public.missions WHERE id = test_id;
    END $$`);
  });

  it('persists complete insights and distinct same-code tasks with nullable nonforecast snapshots', async () => {
    const sessionId = randomUUID();
    const checkIn = await prisma.checkIn.create({
      data: {
        sessionId,
        checkInDate: new Date('2099-02-01T00:00:00Z'),
        sleepHours: 7.5,
        stressLevel: 1,
        moodLevel: 1,
        teamConflictLevel: 1,
        fatigue: 3,
        insights: {
          create: {
            evaluationKey: 'schema-v1',
            title: 'Recorded check-in',
            summary: 'Your check-in is saved.',
            nextStep: 'Review the recorded values.',
            facts: { sleep_hours: 7.5 },
            source: 'fallback',
          },
        },
        actions: {
          create: [
            {
              evaluationKey: 'schema-v1',
              taskKey: 'review_check_in',
              title: 'Review the recorded check-in',
              source: 'check_in',
              kind: 'review_insight',
              actionCode: 'monitor',
              reasonCode: 'recorded_values',
              rulesetVersion: 'schema-v1',
            },
            {
              evaluationKey: 'schema-v1',
              taskKey: 'review_system',
              title: 'Review the system guidance',
              source: 'system',
              actionCode: 'monitor',
              reasonCode: 'recorded_values',
              rulesetVersion: 'schema-v1',
            },
          ],
        },
      },
      include: { actions: true, insights: true },
    });
    try {
      expect(checkIn.actions).toHaveLength(2);
      expect(checkIn.actions.map((action) => action.taskKey).sort()).toEqual([
        'review_check_in',
        'review_system',
      ]);
      expect(checkIn.actions.every((action) => action.forecastSnapshot === null)).toBe(true);
      expect(checkIn.actions.every((action) => action.status === 'suggested')).toBe(true);
      expect(checkIn.actions.find((action) => action.source === 'system')?.kind).toBe('task');
      expect(checkIn.insights[0]).toMatchObject({
        nextStep: 'Review the recorded values.',
        facts: { sleep_hours: 7.5 },
        source: 'fallback',
        generator: null,
        supersededAt: null,
      });
      const task = await prisma.checkInAction.findUniqueOrThrow({
        where: {
          checkInId_evaluationKey_taskKey: {
            checkInId: checkIn.id,
            evaluationKey: 'schema-v1',
            taskKey: 'review_check_in',
          },
        },
      });
      expect(task.id).toBe(checkIn.actions.find((action) => action.taskKey === 'review_check_in')?.id);
    } finally {
      await prisma.checkIn.delete({ where: { id: checkIn.id } });
    }
    expect(await prisma.checkInAction.count({ where: { checkInId: checkIn.id } })).toBe(0);
    expect(await prisma.checkInInsight.count({ where: { checkInId: checkIn.id } })).toBe(0);
  });

  it('enforces required task metadata, forecast guards and one current insight per check-in', async () => {
    await prisma.$executeRawUnsafe(`DO $$
    DECLARE
      check_in uuid;
      action_id uuid;
      insight_id uuid;
      field_name text;
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'check_in_actions' AND column_name IN ('task_key', 'title', 'source'))
            OR (table_name = 'check_in_insights' AND column_name = 'next_step')
          )
          AND (is_nullable <> 'NO' OR column_default IS NOT NULL)
      ) THEN
        RAISE EXCEPTION 'Required plan content has a default or permits NULL';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE oid IN ('public.check_in_actions'::regclass, 'public.check_in_insights'::regclass)
          AND NOT relrowsecurity
      ) THEN
        RAISE EXCEPTION 'Plan tables must enable row level security';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name)
        CROSS JOIN (VALUES ('public.check_in_actions'), ('public.check_in_insights')) AS tables(table_name)
        WHERE has_table_privilege(role_name, table_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      ) THEN
        RAISE EXCEPTION 'Plan tables must not grant client access';
      END IF;
      INSERT INTO public.check_ins (
        session_id, check_in_date, sleep_hours, stress_level, mood_level, team_conflict_level, fatigue
      ) VALUES (gen_random_uuid(), DATE '2099-02-02', 7.5, 1, 1, 1, 3)
      RETURNING id INTO check_in;
      INSERT INTO public.check_in_actions (
        check_in_id, evaluation_key, task_key, title, source, action_code, reason_code, ruleset_version
      ) VALUES (check_in, 'schema-v1', 'review', 'Review check-in', 'check_in', 'monitor', 'recorded', 'v1')
      RETURNING id INTO action_id;
      FOREACH field_name IN ARRAY ARRAY['task_key', 'title', 'source', 'kind'] LOOP
        BEGIN
          EXECUTE format('UPDATE public.check_in_actions SET %I = NULL WHERE id = $1', field_name) USING action_id;
          RAISE EXCEPTION 'NULL accepted for action %', field_name;
        EXCEPTION WHEN not_null_violation THEN NULL;
        END;
        BEGIN
          EXECUTE format('UPDATE public.check_in_actions SET %I = %L WHERE id = $1', field_name, ' ') USING action_id;
          RAISE EXCEPTION 'Blank accepted for action %', field_name;
        EXCEPTION WHEN check_violation THEN NULL;
        END;
      END LOOP;
      BEGIN
        UPDATE public.check_in_actions SET source = 'forecast' WHERE id = action_id;
        RAISE EXCEPTION 'Forecast task without snapshot was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      BEGIN
        UPDATE public.check_in_actions SET forecast_snapshot = '{}'::jsonb WHERE id = action_id;
        RAISE EXCEPTION 'Malformed snapshot was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      BEGIN
        INSERT INTO public.check_in_actions (
          check_in_id, evaluation_key, task_key, title, source, action_code, reason_code, ruleset_version
        ) VALUES (check_in, 'schema-v1', 'review', 'Duplicate task', 'system', 'recheck', 'recorded', 'v1');
        RAISE EXCEPTION 'Duplicate task key was accepted';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      INSERT INTO public.check_in_insights (
        check_in_id, evaluation_key, title, summary, next_step, facts, source
      ) VALUES (check_in, 'schema-v1', 'Recorded', 'Saved values', 'Review the values', '{}'::jsonb, 'fallback')
      RETURNING id INTO insight_id;
      FOREACH field_name IN ARRAY ARRAY['evaluation_key', 'title', 'summary', 'next_step', 'facts', 'source'] LOOP
        BEGIN
          EXECUTE format('UPDATE public.check_in_insights SET %I = NULL WHERE id = $1', field_name) USING insight_id;
          RAISE EXCEPTION 'NULL accepted for insight %', field_name;
        EXCEPTION WHEN not_null_violation THEN NULL;
        END;
      END LOOP;
      FOREACH field_name IN ARRAY ARRAY['evaluation_key', 'title', 'summary', 'next_step', 'source'] LOOP
        BEGIN
          EXECUTE format('UPDATE public.check_in_insights SET %I = %L WHERE id = $1', field_name, ' ') USING insight_id;
          RAISE EXCEPTION 'Blank accepted for insight %', field_name;
        EXCEPTION WHEN check_violation THEN NULL;
        END;
      END LOOP;
      BEGIN
        UPDATE public.check_in_insights SET facts = '[]'::jsonb WHERE id = insight_id;
        RAISE EXCEPTION 'Non-object insight facts were accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      BEGIN
        UPDATE public.check_in_insights SET source = 'ai' WHERE id = insight_id;
        RAISE EXCEPTION 'AI insight without a generator was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      BEGIN
        UPDATE public.check_in_insights SET generator = 'schema-model' WHERE id = insight_id;
        RAISE EXCEPTION 'Fallback insight with a generator was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      BEGIN
        UPDATE public.check_in_insights SET source = 'ai', generator = ' ' WHERE id = insight_id;
        RAISE EXCEPTION 'Blank insight generator was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      BEGIN
        UPDATE public.check_in_insights SET superseded_at = created_at - interval '1 second' WHERE id = insight_id;
        RAISE EXCEPTION 'Insight supersession before creation was accepted';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      BEGIN
        INSERT INTO public.check_in_insights (
          check_in_id, evaluation_key, title, summary, next_step, facts, source, generator
        ) VALUES (check_in, 'schema-v2', 'New', 'New values', 'Review again', '{}'::jsonb, 'ai', 'schema-model');
        RAISE EXCEPTION 'A second current insight was accepted';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      UPDATE public.check_in_insights SET superseded_at = now() WHERE id = insight_id;
      INSERT INTO public.check_in_insights (
        check_in_id, evaluation_key, title, summary, next_step, facts, source, generator
      ) VALUES (check_in, 'schema-v2', 'New', 'New values', 'Review again', '{}'::jsonb, 'ai', 'schema-model');
      BEGIN
        INSERT INTO public.check_in_insights (
          check_in_id, evaluation_key, title, summary, next_step, facts, source, superseded_at
        ) VALUES (check_in, 'schema-v1', 'Duplicate', 'Old values', 'Review again', '{}'::jsonb, 'fallback', now());
        RAISE EXCEPTION 'Duplicate insight evaluation was accepted';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      DELETE FROM public.check_ins WHERE id = check_in;
    END $$`);
  });

  it.each(['anon', 'authenticated'])(
    'retains server-only health access and RLS-filtered options for %s',
    async (role) => {
      await prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        expect(await transaction.fatigueOption.findMany()).toEqual([]);
      });
      await expect(
        prisma.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await transaction.checkIn.findMany();
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        prisma.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await transaction.mission.findMany();
        }),
      ).rejects.toThrow(/permission denied/);
      for (const table of ['check_in_actions', 'check_in_insights']) {
        await expect(
          prisma.$transaction(async (transaction) => {
            await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
            await transaction.$queryRawUnsafe(`SELECT * FROM public.${table}`);
          }),
        ).rejects.toThrow(/permission denied/);
      }
    },
  );

  it('reuses migration history without dropping check-ins or duplicating mission seeds', async () => {
    const sessionId = randomUUID();
    const checkIn = await prisma.checkIn.create({
      data: {
        sessionId,
        checkInDate: new Date('2099-01-01T00:00:00Z'),
        sleepHours: 7.5,
        stressLevel: 1,
        moodLevel: 1,
        teamConflictLevel: 1,
        fatigue: 3,
        description: 'Replay must preserve this synthetic record.',
      },
    });
    try {
      const demo = await prisma.mission.findUniqueOrThrow({
        where: { code: 'demo-crew-12' },
      });
      await prepareDatabase();
      expect(
        await prisma.checkIn.findUniqueOrThrow({ where: { id: checkIn.id } }),
      ).toEqual(checkIn);
      expect(
        await prisma.mission.findUniqueOrThrow({
          where: { code: 'demo-crew-12' },
        }),
      ).toEqual(demo);
    } finally {
      await prisma.checkIn.deleteMany({ where: { sessionId } });
    }
  });
});
