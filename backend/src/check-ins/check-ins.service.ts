import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Clock } from '../common/clock.js';
import { ApiError } from '../common/api-error.js';
import type { PutCheckInInput } from './dto/put-check-in.input.js';
import type { CheckInDateInput } from './dto/check-in-date.input.js';
import type { ListCheckInsInput } from './dto/list-check-ins.input.js';
import type { CheckInOutput } from './dto/check-in.output.js';
import type { ListCheckInsOutput } from './dto/list-check-ins.output.js';
import type { CheckInOptionsOutput } from './dto/check-in-options.output.js';
import { presentCheckIn } from './check-in.presenter.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class CheckInsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async put(input: PutCheckInInput): Promise<CheckInOutput> {
    const { sessionId, checkInDate: date, ...fields } = input;
    if (date !== this.clock.today()) {
      throw new ApiError(
        422,
        'CHECK_IN_DATE_NOT_WRITABLE',
        'Only the current UTC date can be written.',
      );
    }
    const checkInDate = new Date(`${date}T00:00:00.000Z`);
    const data = { ...fields, description: fields.description ?? null };
    const record = await this.prisma.checkIn.upsert({
      where: { sessionId_checkInDate: { sessionId, checkInDate } },
      create: { sessionId, checkInDate, ...data },
      update: data,
    });
    return presentCheckIn(record);
  }

  async get(input: CheckInDateInput): Promise<CheckInOutput> {
    const { sessionId } = input;
    const checkInDate = new Date(`${input.checkInDate}T00:00:00.000Z`);
    const record = await this.prisma.checkIn.findUnique({
      where: { sessionId_checkInDate: { sessionId, checkInDate } },
    });
    if (!record)
      throw new ApiError(
        404,
        'CHECK_IN_NOT_FOUND',
        'No check-in found for this date.',
      );
    return presentCheckIn(record);
  }

  async list(input: ListCheckInsInput): Promise<ListCheckInsOutput> {
    const { sessionId, from, to, limit = 7 } = input;
    const args: Prisma.CheckInFindManyArgs =
      from === undefined
        ? {
            where: { sessionId },
            orderBy: { checkInDate: 'desc' },
            take: limit,
          }
        : {
            where: {
              sessionId,
              checkInDate: {
                gte: new Date(`${from}T00:00:00.000Z`),
                lt: new Date(`${to}T00:00:00.000Z`),
              },
            },
            orderBy: { checkInDate: 'asc' },
          };
    const records = await this.prisma.checkIn.findMany(args);
    return {
      items: records.map(presentCheckIn),
      today: this.clock.today(),
      timezone: 'UTC',
    };
  }

  async options(): Promise<CheckInOptionsOutput> {
    const order = { orderBy: { value: 'asc' as const } };
    const [stress, mood, conflict, fatigue] = await this.prisma.$transaction([
      this.prisma.stressLevelOption.findMany(order),
      this.prisma.moodLevelOption.findMany(order),
      this.prisma.teamConflictLevelOption.findMany(order),
      this.prisma.fatigueOption.findMany(order),
    ]);
    return {
      stress_level: stress,
      mood_level: mood,
      team_conflict_level: conflict,
      fatigue,
    };
  }
}
