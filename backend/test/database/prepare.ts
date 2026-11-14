import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  const prismaCli = createRequire(import.meta.url).resolve(
    'prisma/build/index.js',
  );
  const directory = fileURLToPath(
    new URL('../../../supabase/migrations/', import.meta.url),
  );
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const [state] = await prisma.$queryRaw<
      { tracked: boolean; tables: number }[]
    >`
      SELECT
        to_regclass('mittus_test_meta.migrations') IS NOT NULL AS tracked,
        (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS tables
    `;
    if (!state.tracked && state.tables !== 0) {
      throw new Error(
        'Migration replay requires an empty local mittus_test database. Existing tables are never dropped.',
      );
    }
    // Emulate Supabase roles locally; production roles and history are never touched.
    await prisma.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
    END $$`);
    await prisma.$executeRawUnsafe(
      'GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role',
    );
    await prisma.$executeRawUnsafe(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role',
    );
    await prisma.$executeRawUnsafe(
      'CREATE SCHEMA IF NOT EXISTS mittus_test_meta',
    );
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS mittus_test_meta.migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL
    )`);
    const files = (await readdir(directory))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) {
        throw new Error(`Invalid migration filename: ${file}`);
      }
      const sql = await readFile(join(directory, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const [applied] = await prisma.$queryRaw<{ checksum: string }[]>`
        SELECT checksum FROM mittus_test_meta.migrations WHERE name = ${file}
      `;
      if (applied) {
        if (applied.checksum !== checksum) {
          throw new Error(
            `Applied test migration changed: ${file}. Use a fresh isolated database.`,
          );
        }
        continue;
      }
      // The file and its checksum are committed together, with no db push or schema reset.
      execFileSync(
        process.execPath,
        [prismaCli, 'db', 'execute', '--stdin', '--url', databaseUrl],
        {
          input: `BEGIN;\n${sql}\nINSERT INTO mittus_test_meta.migrations (name, checksum) VALUES ('${file}', '${checksum}');\nCOMMIT;`,
          stdio: 'pipe',
        },
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
