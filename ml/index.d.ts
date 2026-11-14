export type FatigueCheckIn = Readonly<{ sleep_hours: number; fatigue: number }>;

export type EresForecast =
  | { status: "insufficient_history" }
  | {
      status: "ok";
      probability_high_fatigue: number;
      model_version: string;
      predicted_at: string;
    };

/** Pass the full history of one session, ordered from oldest to newest. */
export declare function predictFatigue(history: readonly FatigueCheckIn[]): EresForecast;
