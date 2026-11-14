import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { Clock } from '../common/clock.js';
import { lockSession } from '../common/session-lock.js';
import { ForecastService } from '../forecast/forecast.service.js';
import type { ForecastCheckIn } from '../forecast/dto/forecast-check-in.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { presentCheckInAction } from './check-in-action.presenter.js';
import {
  chooseAction,
  explainAction,
  rulesetVersion,
} from './check-in-action.rules.js';
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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ForecastService) private readonly forecast: ForecastService,
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
      take: 90,
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

  async evaluate(
    input: CheckInActionsInput,
  ): Promise<EvaluateCheckInActionsOutput> {
    const history = await this.history(this.prisma, input);
    const revision = fingerprint(history);
    // Network inference must not hold a database connection or transaction lock.
    const forecast = await this.forecast.predict(history);
    return this.prisma.$transaction(async (transaction) => {
      await lockSession(transaction, input.sessionId);
      const current = await this.history(transaction, input);
      if (fingerprint(current) !== revision) {
        throw new ApiError(
          409,
          'EVALUATION_OUTDATED',
          'Check-in history changed during evaluation. Evaluate again.',
        );
      }
      const latest = await transaction.checkInAction.findFirst({
        where: { checkInId: input.checkInId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const now = new Date(
        Math.max(
          this.clock.now().getTime(),
          latest?.createdAt.getTime() ?? 0,
          latest?.acknowledgedAt?.getTime() ?? 0,
        ),
      );
      if (forecast.status !== 'ready') {
        await transaction.checkInAction.updateMany({
          where: {
            checkInId: input.checkInId,
            status: { in: pendingStatuses },
          },
          data: { status: 'superseded', resolvedAt: now },
        });
        return {
          status: forecast.status,
          action: null,
          explanation:
            forecast.status === 'insufficient_history'
              ? 'There is not enough history to generate an experimental plan.'
              : 'The experimental plan is temporarily unavailable. Your check-in is still saved.',
        };
      }
      const evaluationKey = createHash('sha256')
        .update(
          JSON.stringify([
            revision,
            forecast.model_version,
            rulesetVersion,
            forecast.probability_high_fatigue,
          ]),
        )
        .digest('hex');
      const choice = chooseAction(forecast.probability_high_fatigue);
      const existing =
        latest?.evaluationKey.startsWith(`${evaluationKey}:`) &&
        latest.actionCode === choice.actionCode &&
        latest.status !== 'superseded'
          ? latest
          : null;
      await transaction.checkInAction.updateMany({
        where: {
          checkInId: input.checkInId,
          status: { in: pendingStatuses },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        data: { status: 'superseded', resolvedAt: now },
      });
      const action =
        existing ??
        (await transaction.checkInAction.create({
          data: {
            checkInId: input.checkInId,
            evaluationKey: `${evaluationKey}:${latest?.id ?? 'initial'}`,
            ...choice,
            rulesetVersion,
            forecastSnapshot: {
              probability_high_fatigue: forecast.probability_high_fatigue,
              model_version: forecast.model_version,
              predicted_at: forecast.predicted_at,
            },
            // Keep a strict history order even when the clock has millisecond ties.
            createdAt: new Date(
              Math.max(now.getTime(), (latest?.createdAt.getTime() ?? -1) + 1),
            ),
          },
        }));
      return {
        status: 'ready',
        action: presentCheckInAction(action),
        explanation: explainAction(action.actionCode),
      };
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
