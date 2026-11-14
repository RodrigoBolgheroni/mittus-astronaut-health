import type { CheckInDateInput } from './check-in-date.input.js';

export interface PutCheckInInput extends CheckInDateInput {
  sleepHours: number;
  stressLevel: number;
  moodLevel: number;
  teamConflictLevel: number;
  fatigue: number;
  description?: string | null;
}
