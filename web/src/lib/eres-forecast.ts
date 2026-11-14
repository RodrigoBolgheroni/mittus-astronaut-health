import model from "./fatigue-model.json" with { type: "json" };

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
export function predictFatigue(history: readonly FatigueCheckIn[]): EresForecast {
  if (history.length < 3) return { status: "insufficient_history" };

  const length = history.length;
  const last = history[length - 1];
  const center = (length - 1) / 2;
  let recentSleepSum = 0;
  let recentFatigueSum = 0;
  let sleepSum = 0;
  let fatigueSum = 0;
  let sleepTrend = 0;
  let fatigueTrend = 0;
  let squaredOffsetSum = 0;

  for (const [index, { sleep_hours: sleep, fatigue }] of history.entries()) {
    if (!Number.isFinite(sleep) || sleep < 0 || sleep > 24 ||
        !Number.isInteger(fatigue) || fatigue < 1 || fatigue > 7) {
      throw new RangeError("Sleep hours must be 0 to 24 and fatigue must be an integer from 1 to 7.");
    }
    sleepSum += sleep;
    fatigueSum += fatigue;
    const offset = index - center;
    sleepTrend += offset * sleep;
    fatigueTrend += offset * fatigue;
    squaredOffsetSum += offset ** 2;

    if (index >= length - 3) {
      recentSleepSum += sleep;
      recentFatigueSum += fatigue;
    }
  }

  // Project the fitted linear trend from the historical mean to the next check-in.
  const trendFactor = (length - center) / squaredOffsetSum;
  const features = [
    last.sleep_hours, recentSleepSum / 3, last.fatigue, recentFatigueSum / 3,
    sleepSum / length, fatigueSum / length, sleepTrend * trendFactor, fatigueTrend * trendFactor,
  ];
  const score = features.reduce((sum, value, index) => {
    const standardized = (value - model.means[index]) / model.scales[index];
    return sum + standardized * model.coefficients[index];
  }, model.intercept);

  return {
    status: "ok",
    probability_high_fatigue: 1 / (1 + Math.exp(-score)),
    model_version: model.model_version,
    predicted_at: new Date().toISOString(),
  };
}
