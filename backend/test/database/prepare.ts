import { execFileSync } from 'node:child_process';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      'Set TEST_DATABASE_URL to a local, isolated mittus_test database.',
    );
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/mittus_test'
  ) {
    throw new Error(
      'Integration tests require a local database named mittus_test.',
    );
  }
  return value;
}

export default async function prepareDatabase() {
  const databaseUrl = testDatabaseUrl();
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'push', '--skip-generate'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const labels = {
      stress: ['Very calm', 'Calm', 'Moderate', 'Stressed', 'Very stressed'],
      mood: [
        'Very happy / positive',
        'Positive',
        'Neutral',
        'Negative',
        'Very sad / negative',
      ],
      conflict: [
        'No team conflict',
        'Low team conflict',
        'Moderate team conflict',
        'High team conflict',
        'Very high team conflict',
      ],
      fatigue: [
        'Fully alert and wide awake',
        'Very active and responsive, but not at peak alertness',
        'Feeling well and ready',
        'A little tired and less energetic',
        'Moderately tired and fatigued',
        'Extremely tired, with great difficulty concentrating',
        'Completely exhausted and unable to function effectively',
      ],
    };
    const data = (values: string[]) =>
      values.map((label, index) => ({ value: index + 1, label }));
    await prisma.stressLevelOption.createMany({
      data: data(labels.stress),
      skipDuplicates: true,
    });
    await prisma.moodLevelOption.createMany({
      data: data(labels.mood),
      skipDuplicates: true,
    });
    await prisma.teamConflictLevelOption.createMany({
      data: data(labels.conflict),
      skipDuplicates: true,
    });
    await prisma.fatigueOption.createMany({
      data: data(labels.fatigue),
      skipDuplicates: true,
    });
    // db push does not represent CHECK constraints or RLS; reproduce the existing DB rules.
    const constraints = [
      ['sleep_hours', 0, 24],
      ['stress_level', 1, 5],
      ['mood_level', 1, 5],
      ['team_conflict_level', 1, 5],
      ['fatigue', 1, 7],
    ] as const;
    for (const [field, min, max] of constraints) {
      await prisma.$executeRawUnsafe(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.check_ins'::regclass AND conname='check_ins_${field}_check') THEN
          ALTER TABLE public.check_ins ADD CONSTRAINT check_ins_${field}_check CHECK (${field} BETWEEN ${min} AND ${max});
        END IF;
      END $$`);
    }
    for (const table of [
      'check_ins',
      'check_in_actions',
      'stress_level_options',
      'mood_level_options',
      'team_conflict_level_options',
      'fatigue_options',
    ]) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
