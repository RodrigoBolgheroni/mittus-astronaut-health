import "server-only";

import postgres from "postgres";

/**
 * Shared Postgres client for the Supabase database (DATABASE_URL).
 *
 * `prepare: false` keeps it compatible with the Supabase transaction pooler
 * (port 6543). The client is kept on globalThis so hot reload in development
 * does not open a new pool on every edit.
 */
const globalForDb = globalThis as typeof globalThis & { mittusSql?: postgres.Sql };

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
  }
}

export function getSql(): postgres.Sql {
  if (globalForDb.mittusSql) return globalForDb.mittusSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();
  globalForDb.mittusSql = postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
  return globalForDb.mittusSql;
}
