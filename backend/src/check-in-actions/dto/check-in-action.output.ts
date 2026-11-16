import type { Prisma } from '../../generated/prisma/client.js';
import type { ForecastResult } from '../../forecast/dto/forecast-result.js';

export interface CheckInActionOutput {
  id: string;
  check_in_id: string;
  evaluation_key: string;
  action_code: string;
  reason_code: string;
  ruleset_version: string;
  task_key: string;
  title: string;
  source: string;
  kind: string;
  forecast_snapshot: Prisma.JsonValue;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface CheckInInsightOutput {
  id: string;
  check_in_id: string;
  evaluation_key: string;
  title: string;
  summary: string;
  next_step: string;
  facts: Prisma.JsonValue;
  source: string;
  generator: string | null;
  created_at: string;
  superseded_at: string | null;
}

export interface EvaluateCheckInActionsOutput {
  status: ForecastResult['status'];
  forecast: ForecastResult;
  insight: CheckInInsightOutput;
  actions: CheckInActionOutput[];
}

export interface ListCheckInActionsOutput {
  actions: CheckInActionOutput[];
}
