import { Inject, Injectable } from '@nestjs/common';
import { RuntimeConfig } from '../config.js';
import type { ForecastCheckIn } from '../forecast/dto/forecast-check-in.js';
import type { ForecastResult } from '../forecast/dto/forecast-result.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { GeneratedRecommendation } from './dto/recommendation.output.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isJson(value: unknown): value is Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isJsonObject(value);
}

function isJsonObject(value: unknown): value is Prisma.InputJsonObject {
  return isObject(value) && Object.values(value).every(isJson);
}

function parseRecommendation(
  value: unknown,
  forecast: ForecastResult,
): GeneratedRecommendation | null {
  if (!isObject(value) || !isObject(value.insight)) return null;
  const insight = value.insight;
  if (
    !isText(insight.title) ||
    !isText(insight.summary) ||
    !isText(insight.next_step) ||
    !isJsonObject(insight.facts) ||
    !(
      (insight.source === 'ai' && isText(insight.generator)) ||
      (insight.source === 'fallback' && insight.generator === null)
    ) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length === 0 ||
    value.tasks.length > 90
  ) {
    return null;
  }
  const tasks: GeneratedRecommendation['tasks'] = [];
  const taskKeys = new Set<string>();
  for (const task of value.tasks) {
    if (
      !isObject(task) ||
      typeof task.task_key !== 'string' ||
      !/^[a-z0-9_]+$/.test(task.task_key) ||
      taskKeys.has(task.task_key) ||
      !isText(task.title) ||
      (task.source !== 'check_in' && task.source !== 'forecast') ||
      (task.source === 'forecast' && forecast.status !== 'ready') ||
      (task.kind !== 'task' && task.kind !== 'review_insight') ||
      (task.action_code !== 'monitor' &&
        task.action_code !== 'recheck' &&
        task.action_code !== 'contact_crew' &&
        task.action_code !== 'contact_medical') ||
      !isText(task.reason_code) ||
      !isText(task.ruleset_version)
    ) {
      return null;
    }
    taskKeys.add(task.task_key);
    // Status and forecast snapshots are exclusively assigned by persistence.
    tasks.push({
      task_key: task.task_key,
      title: task.title.trim(),
      source: task.source,
      kind: task.kind,
      action_code: task.action_code,
      reason_code: task.reason_code.trim(),
      ruleset_version: task.ruleset_version.trim(),
    });
  }
  return {
    insight: {
      title: insight.title.trim(),
      summary: insight.summary.trim(),
      next_step: insight.next_step.trim(),
      facts: insight.facts,
      source: insight.source,
      generator: isText(insight.generator) ? insight.generator.trim() : null,
    },
    tasks,
  };
}

@Injectable()
export class CeresService {
  constructor(@Inject(RuntimeConfig) private readonly config: RuntimeConfig) {}

  async generate(
    history: ForecastCheckIn[],
    forecast: ForecastResult,
  ): Promise<GeneratedRecommendation | null> {
    if (!this.config.ceresUrl) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const url = new URL(this.config.ceresUrl);
      url.pathname = `${url.pathname.replace(/\/+$/, '')}/v1/recommendations`;
      // Project canonical fields instead of trusting structurally compatible objects.
      const checkIns = [...history]
        .sort((left, right) =>
          left.check_in_date.localeCompare(right.check_in_date),
        )
        .slice(-90)
        .map((checkIn) => ({
          id: checkIn.id,
          check_in_date: checkIn.check_in_date,
          sleep_hours: checkIn.sleep_hours,
          stress_level: checkIn.stress_level,
          mood_level: checkIn.mood_level,
          team_conflict_level: checkIn.team_conflict_level,
          fatigue: checkIn.fatigue,
        }));
      const canonicalForecast: ForecastResult =
        forecast.status === 'ready'
          ? {
              status: forecast.status,
              probability_high_fatigue: forecast.probability_high_fatigue,
              model_version: forecast.model_version,
              predicted_at: forecast.predicted_at,
            }
          : { status: forecast.status };
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_ins: checkIns, forecast: canonicalForecast }),
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok) return null;
      return parseRecommendation(await response.json(), forecast);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
