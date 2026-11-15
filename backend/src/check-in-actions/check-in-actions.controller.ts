import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { RequestValidationPipe } from '../common/request-validation.pipe.js';
import type { SessionRequest } from '../session/session.middleware.js';
import { CheckInActionsService } from './check-in-actions.service.js';
import {
  CheckInActionPathParams,
  CheckInActionsPathParams,
} from './path-params/check-in-actions.path-params.js';
import { UpdateCheckInActionRequest } from './requests/update-check-in-action.request.js';

@Controller('check-ins/:checkInId/actions')
export class CheckInActionsController {
  constructor(
    @Inject(CheckInActionsService)
    private readonly service: CheckInActionsService,
  ) {}

  @Post('evaluate')
  @HttpCode(200)
  evaluate(
    @Req() request: SessionRequest,
    @Param(new RequestValidationPipe(CheckInActionsPathParams))
    params: CheckInActionsPathParams,
    @Body() body: unknown,
  ) {
    if (
      body !== undefined &&
      (body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length > 0)
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Evaluation accepts only an empty body.',
      );
    }
    return this.service.evaluate({
      sessionId: request.sessionId,
      checkInId: params.checkInId,
    });
  }

  @Get()
  list(
    @Req() request: SessionRequest,
    @Param(new RequestValidationPipe(CheckInActionsPathParams))
    params: CheckInActionsPathParams,
  ) {
    return this.service.list({
      sessionId: request.sessionId,
      checkInId: params.checkInId,
    });
  }
}

@Controller('check-in-actions')
export class CheckInActionStatusController {
  constructor(
    @Inject(CheckInActionsService)
    private readonly service: CheckInActionsService,
  ) {}

  @Patch(':actionId')
  update(
    @Req() request: SessionRequest,
    @Param(new RequestValidationPipe(CheckInActionPathParams))
    params: CheckInActionPathParams,
    @Body(new RequestValidationPipe(UpdateCheckInActionRequest))
    body: UpdateCheckInActionRequest,
  ) {
    return this.service.update({
      sessionId: request.sessionId,
      actionId: params.actionId,
      status: body.status,
    });
  }
}
