import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { Clock } from '../common/clock.js';
import { lockSession } from '../common/session-lock.js';
import { ForecastService } from '../forecast/forecast.service.js';
import type { ForecastCheckIn } from '../forecast/dto/forecast-check-in.js';
import { Prisma, type CheckInInsight } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { presentCheckInAction, presentCheckInInsight } from './check-in-action.presenter.js';
import { CeresService } from '../recommendations/ceres.service.js';
import { RuntimeConfig } from '../config.js';
import { fallbackRecommendation, planVersion } from '../recommendations/fallback.js';
import type { ForecastResult } from '../forecast/dto/forecast-result.js';
import type {
  CheckInActionsInput,
  UpdateCheckInActionInput,
} from './dto/check-in-actions.input.js';
import type {
  CheckInActionOutput,
  EvaluateCheckInActionsOutput,
  ListCheckInActionsOutput,
} from './dto/check-in-action.output.js';

const pendingStatuses = ['suggested', 'acknowledged'];

function fingerprint(history: ForecastCheckIn[]) {
  return createHash('sha256').update(JSON.stringify(history)).digest('hex');
}

@Injectable()
export class CheckInActionsService {
  private readonly evaluations = new Map<string, Promise<EvaluateCheckInActionsOutput>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ForecastService) private readonly forecast: ForecastService,
    @Inject(CeresService) private readonly ceres: CeresService,
    @Inject(RuntimeConfig) private readonly config: RuntimeConfig,
  ) {}

  private async history(
    transaction: Prisma.TransactionClient,
    input: CheckInActionsInput,
  ): Promise<ForecastCheckIn[]> {
    const checkIn = await transaction.checkIn.findFirst({
      where: { id: input.checkInId, sessionId: input.sessionId },
    });
    if (!checkIn) {
      throw new ApiError(
        404,
        'CHECK_IN_NOT_FOUND',
        'No check-in found for this session.',
      );
    }
    const records = await transaction.checkIn.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { checkInDate: 'desc' },
    });
    if (records[0]?.id !== input.checkInId) {
      throw new ApiError(
        409,
        'CHECK_IN_NOT_LATEST',
        'Evaluate the latest check-in for this session.',
      );
    }
    return records.reverse().map((record) => ({
      id: record.id,
      check_in_date: record.checkInDate.toISOString().slice(0, 10),
      sleep_hours: record.sleepHours.toNumber(),
      stress_level: record.stressLevel,
      mood_level: record.moodLevel,
      team_conflict_level: record.teamConflictLevel,
      fatigue: record.fatigue,
    }));
  }

  async evaluate(input: CheckInActionsInput): Promise<EvaluateCheckInActionsOutput> {
    const history = await this.history(this.prisma, input);
    const revision = fingerprint(history);
    const requestKey = `${input.sessionId}:${input.checkInId}:${revision}`;
    const running = this.evaluations.get(requestKey);
    if (running) return running;
    const work = this.generate(input, history, revision);
    this.evaluations.set(requestKey, work);
    try {
      return await work;
    } finally {
      if (this.evaluations.get(requestKey) === work) this.evaluations.delete(requestKey);
    }
  }

  private async assertRevision(
    transaction: Prisma.TransactionClient,
    input: CheckInActionsInput,
    revision: string,
  ) {
    if (fingerprint(await this.history(transaction, input)) !== revision) {
      throw new ApiError(409, 'EVALUATION_OUTDATED', 'Check-in history changed during evaluation. Evaluate again.');
    }
  }

  private async output(
    transaction: Prisma.TransactionClient,
    insight: CheckInInsight,
    forecast: ForecastResult,
  ): Promise<EvaluateCheckInActionsOutput> {
    const actions = await transaction.checkInAction.findMany({
      where: { checkInId: insight.checkInId, evaluationKey: insight.evaluationKey },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
      status: forecast.status,
      forecast,
      insight: presentCheckInInsight(insight),
      actions: actions.map(presentCheckInAction),
    };
  }

  private async generate(
    input: CheckInActionsInput,
    history: ForecastCheckIn[],
    revision: string,
  ): Promise<EvaluateCheckInActionsOutput> {
    // External calls never hold a database transaction or a session lock.
    const forecast = await this.forecast.predict(history);
    const baseKey = createHash('sha256').update(JSON.stringify([
      revision,
      forecast.status,
      forecast.status === 'ready' ? [forecast.model_version, forecast.probability_high_fatigue] : null,
      planVersion,
      this.config.ceresUrl ?? null,
    ])).digest('hex');
    const current = () => ({
      checkInId: input.checkInId,
      supersededAt: null,
      evaluationKey: { startsWith: `${baseKey}:` },
    });
    const cached = await this.prisma.$transaction(async (transaction) => {
      await lockSession(transaction, input.sessionId);
      await this.assertRevision(transaction, input, revision);
      const insight = await transaction.checkInInsight.findFirst({ where: current() });
      return insight ? this.output(transaction, insight, forecast) : null;
    });
    if (cached) return cached;

    const generated = await this.ceres.generate(history, forecast)
      ?? fallbackRecommendation(history, forecast);
    return this.prisma.$transaction(async (transaction) => {
      await lockSession(transaction, input.sessionId);
      await this.assertRevision(transaction, input, revision);
      // Another process may have published the same evaluation during generation.
      const existing = await transaction.checkInInsight.findFirst({ where: current() });
      if (existing) return this.output(transaction, existing, forecast);

      const previous = await transaction.checkInInsight.findFirst({
        where: { checkInId: input.checkInId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const timestamps = await transaction.checkInAction.aggregate({
        where: { checkInId: input.checkInId },
        _max: { createdAt: true, acknowledgedAt: true },
      });
      const now = new Date(Math.max(
        this.clock.now().getTime(),
        (previous?.createdAt.getTime() ?? -1) + 1,
        (previous?.supersededAt?.getTime() ?? -1) + 1,
        (timestamps._max.createdAt?.getTime() ?? -1) + 1,
        timestamps._max.acknowledgedAt?.getTime() ?? 0,
      ));
      const evaluationKey = `${baseKey}:${previous?.id ?? 'initial'}`;
      await transaction.checkInInsight.updateMany({
        where: { checkInId: input.checkInId, supersededAt: null },
        data: { supersededAt: now },
      });
      await transaction.checkInAction.updateMany({
        where: { checkInId: input.checkInId, status: { in: pendingStatuses } },
        data: { status: 'superseded', resolvedAt: now },
      });
      const insight = await transaction.checkInInsight.create({
        data: {
          checkInId: input.checkInId,
          evaluationKey,
          title: generated.insight.title,
          summary: generated.insight.summary,
          nextStep: generated.insight.next_step,
          facts: generated.insight.facts,
          source: generated.insight.source,
          generator: generated.insight.generator,
          createdAt: now,
        },
      });
      await transaction.checkInAction.createMany({
        data: generated.tasks.map((task, index) => ({
          checkInId: input.checkInId,
          evaluationKey,
          taskKey: task.task_key,
          title: task.title,
          source: task.source,
          kind: task.kind,
          actionCode: task.action_code,
          reasonCode: task.reason_code,
          rulesetVersion: task.ruleset_version,
          forecastSnapshot: task.source === 'forecast' && forecast.status === 'ready'
            ? {
                probability_high_fatigue: forecast.probability_high_fatigue,
                model_version: forecast.model_version,
                predicted_at: forecast.predicted_at,
              }
            : Prisma.DbNull,
          createdAt: new Date(now.getTime() + index),
        })),
      });
      return this.output(transaction, insight, forecast);
    });
  }

  async list(input: CheckInActionsInput): Promise<ListCheckInActionsOutput> {
    const checkIn = await this.prisma.checkIn.findFirst({
      where: { id: input.checkInId, sessionId: input.sessionId },
      select: { id: true },
    });
    if (!checkIn) {
      throw new ApiError(
        404,
        'CHECK_IN_NOT_FOUND',
        'No check-in found for this session.',
      );
    }
    const actions = await this.prisma.checkInAction.findMany({
      where: {
        checkInId: input.checkInId,
        checkIn: { sessionId: input.sessionId },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 90,
    });
    return { actions: actions.map(presentCheckInAction) };
  }

  async update(input: UpdateCheckInActionInput): Promise<CheckInActionOutput> {
    return this.prisma.$transaction(async (transaction) => {
      await lockSession(transaction, input.sessionId);
      const action = await transaction.checkInAction.findFirst({
        where: { id: input.actionId, checkIn: { sessionId: input.sessionId } },
      });
      if (!action) {
        throw new ApiError(
          404,
          'CHECK_IN_ACTION_NOT_FOUND',
          'No action found for this session.',
        );
      }
      if (action.status === input.status) return presentCheckInAction(action);
      if (!pendingStatuses.includes(action.status)) {
        throw new ApiError(
          409,
          'ACTION_NOT_PENDING',
          'Only pending actions can change status.',
        );
      }
      const now = new Date(
        Math.max(
          this.clock.now().getTime(),
          action.createdAt.getTime(),
          action.acknowledgedAt?.getTime() ?? 0,
        ),
      );
      const updated = await transaction.checkInAction.update({
        where: { id: action.id },
        data: {
          status: input.status,
          ...(input.status === 'acknowledged'
            ? { acknowledgedAt: now }
            : { resolvedAt: now }),
        },
      });
      return presentCheckInAction(updated);
    });
  }
}
