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
