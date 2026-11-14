import type { CheckInAction } from '../generated/prisma/client.js';
import type { CheckInActionOutput } from './dto/check-in-action.output.js';

export function presentCheckInAction(
  record: CheckInAction,
): CheckInActionOutput {
  return {
    id: record.id,
    check_in_id: record.checkInId,
    evaluation_key: record.evaluationKey,
    action_code: record.actionCode,
    reason_code: record.reasonCode,
    ruleset_version: record.rulesetVersion,
    forecast_snapshot: record.forecastSnapshot,
    status: record.status,
    created_at: record.createdAt.toISOString(),
    acknowledged_at: record.acknowledgedAt?.toISOString() ?? null,
    resolved_at: record.resolvedAt?.toISOString() ?? null,
  };
}
