import type { Prisma } from '../../generated/prisma/client.js';

export interface CheckInActionOutput {
  id: string;
  check_in_id: string;
  evaluation_key: string;
  action_code: string;
  reason_code: string;
  ruleset_version: string;
  forecast_snapshot: Prisma.JsonValue;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface EvaluateCheckInActionsOutput {
  status: 'ready' | 'insufficient_history' | 'unavailable';
  action: CheckInActionOutput | null;
  explanation: string;
}

export interface ListCheckInActionsOutput {
  actions: CheckInActionOutput[];
}
