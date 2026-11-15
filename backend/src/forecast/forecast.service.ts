import { Inject, Injectable } from '@nestjs/common';
import { predictFatigue } from '@mittus/fatigue-model';
import { RuntimeConfig } from '../config.js';
import type { ForecastCheckIn } from './dto/forecast-check-in.js';
import type { ForecastResult } from './dto/forecast-result.js';

function parseForecast(value: unknown): ForecastResult {
  if (typeof value !== 'object' || value === null)
    return { status: 'unavailable' };
  const data = value as Record<string, unknown>;
  if (data.status === 'insufficient_history')
    return { status: 'insufficient_history' };
  if (
    data.status !== 'ready' ||
    typeof data.probability_high_fatigue !== 'number' ||
    !Number.isFinite(data.probability_high_fatigue) ||
    data.probability_high_fatigue < 0 ||
    data.probability_high_fatigue > 1 ||
    typeof data.model_version !== 'string' ||
    data.model_version.trim().length === 0 ||
    data.model_version.length > 128 ||
    typeof data.predicted_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
      data.predicted_at,
    )
  ) {
    return { status: 'unavailable' };
  }
  const timestamp = new Date(data.predicted_at);
  if (
    !Number.isFinite(timestamp.getTime()) ||
    timestamp.toISOString() !==
      data.predicted_at.replace(
        /(?:\.(\d{1,3}))?Z$/,
        (_, fraction: string | undefined) =>
          `.${(fraction ?? '').padEnd(3, '0')}Z`,
      )
  ) {
    return { status: 'unavailable' };
  }
  return {
    status: 'ready',
    probability_high_fatigue: data.probability_high_fatigue,
    model_version: data.model_version.trim(),
    predicted_at: data.predicted_at,
  };
}

@Injectable()
export class ForecastService {
  constructor(@Inject(RuntimeConfig) private readonly config: RuntimeConfig) {}

  async predict(history: ForecastCheckIn[]): Promise<ForecastResult> {
    // Explicitly project the model inputs; structural typing must not leak private fields.
    const checkIns = history
      .map((checkIn) => ({
        id: checkIn.id,
        check_in_date: checkIn.check_in_date,
        sleep_hours: checkIn.sleep_hours,
        stress_level: checkIn.stress_level,
        mood_level: checkIn.mood_level,
        team_conflict_level: checkIn.team_conflict_level,
        fatigue: checkIn.fatigue,
      }))
      .sort((left, right) =>
        left.check_in_date.localeCompare(right.check_in_date),
      );
    if (!this.config.fatigueForecastUrl) {
      const forecast = predictFatigue(checkIns);
      return forecast.status === 'ok'
        ? { ...forecast, status: 'ready' }
        : forecast;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(this.config.fatigueForecastUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_ins: checkIns }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) return { status: 'unavailable' };
      return parseForecast(await response.json());
    } catch {
      return { status: 'unavailable' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
