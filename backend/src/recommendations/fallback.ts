import type { ForecastCheckIn } from '../forecast/dto/forecast-check-in.js';
import type { ForecastResult } from '../forecast/dto/forecast-result.js';
import { chooseAction, explainAction, rulesetVersion } from '../check-in-actions/check-in-action.rules.js';
import type { GeneratedRecommendation } from './dto/recommendation.output.js';

export const planVersion = 'persisted-check-in-plan-v1';

/** Recorded values and the existing demo policy, never a substitute model prediction. */
export function fallbackRecommendation(
  history: ForecastCheckIn[],
  forecast: ForecastResult,
): GeneratedRecommendation {
  const latest = history[history.length - 1]!;
  const previousCount = history.length - 1;
  let sleepTotal = 0;
  let fatigueTotal = 0;
  for (let index = 0; index < previousCount; index++) {
    sleepTotal += history[index]!.sleep_hours;
    fatigueTotal += history[index]!.fatigue;
  }
  const round = (value: number) => Math.round(value * 10) / 10;
  const signed = (value: number) => round(value) > 0 ? `+${round(value)}` : String(round(value));
  const previousSleep = previousCount ? sleepTotal / previousCount : null;
  const previousFatigue = previousCount ? fatigueTotal / previousCount : null;
  const summary = previousSleep !== null && previousFatigue !== null
    ? `Sleep · ${latest.sleep_hours} h today / ${round(previousSleep)} h previous average\nDifference · ${signed(latest.sleep_hours - previousSleep)} h\n\nFatigue · ${latest.fatigue}/7 today / ${round(previousFatigue)}/7 previous average\nDifference · ${signed(latest.fatigue - previousFatigue)} points\n\nComparison with ${previousCount} previous check-ins. This summary uses your recorded values.`
    : `Sleep · ${latest.sleep_hours} h today\n\nFatigue · ${latest.fatigue}/7 today\n\nThis summary uses your recorded values.`;
  const tasks: GeneratedRecommendation['tasks'] = [{
    task_key: 'review_insight',
    title: 'Review your check-in insight',
    source: 'check_in',
    kind: 'review_insight',
    action_code: 'monitor',
    reason_code: 'review_recorded_values',
    ruleset_version: planVersion,
  }];
  if (forecast.status === 'ready') {
    const choice = chooseAction(forecast.probability_high_fatigue);
    tasks.push({
      task_key: choice.actionCode,
      title: choice.actionCode === 'recheck' ? 'Record a new check-in' : 'Keep tracking your check-ins',
      source: 'forecast',
      kind: 'task',
      action_code: choice.actionCode,
      reason_code: choice.reasonCode,
      ruleset_version: rulesetVersion,
    });
  }
  return {
    insight: {
      title: 'Your recorded check-in',
      summary,
      next_step: forecast.status === 'ready'
        ? explainAction(chooseAction(forecast.probability_high_fatigue).actionCode)
        : 'Review your recorded values. Keep adding daily check-ins; an experimental forecast is not available for this evaluation. This is not medical advice.',
      facts: {
        check_in_date: latest.check_in_date,
        sleep_hours: latest.sleep_hours,
        fatigue: latest.fatigue,
        history_count: history.length,
        previous_sleep_average: previousSleep,
        previous_fatigue_average: previousFatigue,
      },
      source: 'fallback',
      generator: null,
    },
    tasks,
  };
}
