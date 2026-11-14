export interface CheckInOptionOutput {
  value: number;
  label: string;
}

export interface CheckInOptionsOutput {
  stress_level: CheckInOptionOutput[];
  mood_level: CheckInOptionOutput[];
  team_conflict_level: CheckInOptionOutput[];
  fatigue: CheckInOptionOutput[];
}
