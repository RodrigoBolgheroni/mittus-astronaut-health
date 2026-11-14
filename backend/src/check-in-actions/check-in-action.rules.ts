// Demo display policy for synthetic data, not a clinical decision threshold.
export const rulesetVersion = 'demo-follow-up-v1';
const recheckProbability = 0.5;

export function chooseAction(probability: number) {
  return probability >= recheckProbability
    ? {
        actionCode: 'recheck',
        reasonCode: 'forecast_at_or_above_demo_threshold',
      }
    : { actionCode: 'monitor', reasonCode: 'forecast_below_demo_threshold' };
}

export function explainAction(actionCode: string) {
  return actionCode === 'recheck'
    ? 'The experimental forecast suggests reviewing your records and making a new check-in when appropriate. This is not medical advice.'
    : 'Continue tracking your records. This experimental suggestion is not medical advice.';
}
