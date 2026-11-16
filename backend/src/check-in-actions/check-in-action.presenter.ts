import type { CheckInAction, CheckInInsight } from '../generated/prisma/client.js';
import type { CheckInActionOutput, CheckInInsightOutput } from './dto/check-in-action.output.js';

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
    task_key: record.taskKey,
    title: record.title,
    source: record.source,
    kind: record.kind,
    forecast_snapshot: record.forecastSnapshot,
    status: record.status,
    created_at: record.createdAt.toISOString(),
    acknowledged_at: record.acknowledgedAt?.toISOString() ?? null,
    resolved_at: record.resolvedAt?.toISOString() ?? null,
  };
}

export function presentCheckInInsight(record: CheckInInsight): CheckInInsightOutput {
  return {
    id: record.id,
    check_in_id: record.checkInId,
    evaluation_key: record.evaluationKey,
    title: record.title,
    summary: record.summary,
    next_step: record.nextStep,
    facts: record.facts,
    source: record.source,
    generator: record.generator,
    created_at: record.createdAt.toISOString(),
    superseded_at: record.supersededAt?.toISOString() ?? null,
  };
}
