import type { CheckIn } from '../generated/prisma/client.js';
import type { CheckInOutput } from './dto/check-in.output.js';

export function presentCheckIn(record: CheckIn): CheckInOutput {
  return {
    id: record.id,
    check_in_date: record.checkInDate.toISOString().slice(0, 10),
    sleep_hours: record.sleepHours.toNumber(),
    stress_level: record.stressLevel,
    mood_level: record.moodLevel,
    team_conflict_level: record.teamConflictLevel,
    fatigue: record.fatigue,
    description: record.description,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}
