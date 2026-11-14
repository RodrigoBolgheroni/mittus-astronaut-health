export interface CheckInOutput {
  id: string;
  check_in_date: string;
  sleep_hours: number;
  stress_level: number;
  mood_level: number;
  team_conflict_level: number;
  fatigue: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}
