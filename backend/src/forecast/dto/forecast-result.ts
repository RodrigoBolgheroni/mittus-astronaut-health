export interface ReadyForecast {
  status: 'ready';
  probability_high_fatigue: number;
  model_version: string;
  predicted_at: string;
}

export type ForecastResult =
  | ReadyForecast
  | { status: 'insufficient_history' }
  | { status: 'unavailable' };
