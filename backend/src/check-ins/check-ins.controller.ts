import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { SessionRequest } from '../session/session.middleware.js';
import { CheckInsService } from './check-ins.service.js';
import { RequestValidationPipe } from '../common/request-validation.pipe.js';
import { PutCheckInRequest } from './requests/put-check-in.request.js';
import { CheckInPathParams } from './path-params/check-in.path-params.js';
import { ListCheckInsQueryParams } from './query-params/list-check-ins.query-params.js';

@Controller('check-ins')
export class CheckInsController {
  constructor(
    @Inject(CheckInsService) private readonly service: CheckInsService,
  ) {}

  @Put(':date')
  put(
    @Req() request: SessionRequest,
    @Param(new RequestValidationPipe(CheckInPathParams))
    params: CheckInPathParams,
    @Body(new RequestValidationPipe(PutCheckInRequest)) body: PutCheckInRequest,
  ) {
    return this.service.put({
      sessionId: request.sessionId,
      checkInDate: params.date,
      sleepHours: body.sleep_hours,
      stressLevel: body.stress_level,
      moodLevel: body.mood_level,
      teamConflictLevel: body.team_conflict_level,
      fatigue: body.fatigue,
      description: body.description,
    });
  }

  @Get()
  list(
    @Req() request: SessionRequest,
    @Query(new RequestValidationPipe(ListCheckInsQueryParams))
    query: ListCheckInsQueryParams,
  ) {
    return this.service.list({
      sessionId: request.sessionId,
      limit: query.limit,
      from: query.from,
      to: query.to,
    });
  }

  @Get(':date')
  get(
    @Req() request: SessionRequest,
    @Param(new RequestValidationPipe(CheckInPathParams))
    params: CheckInPathParams,
  ) {
    return this.service.get({
      sessionId: request.sessionId,
      checkInDate: params.date,
    });
  }
}

@Controller('check-in-options')
export class CheckInOptionsController {
  constructor(
    @Inject(CheckInsService) private readonly service: CheckInsService,
  ) {}

  @Get()
  get() {
    return this.service.options();
  }
}
