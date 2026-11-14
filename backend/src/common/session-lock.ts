import type { Prisma } from '../generated/prisma/client.js';

// All check-in and action mutations participate in the same session lock.
export async function lockSession(
  transaction: Prisma.TransactionClient,
  sessionId: string,
) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))::text
  `;
}
