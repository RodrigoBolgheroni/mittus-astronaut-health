import { Module } from '@nestjs/common';
import { RuntimeConfig } from './config.js';
import { Clock } from './common/clock.js';
import { PrismaService } from './prisma/prisma.service.js';
import { CheckInsService } from './check-ins/check-ins.service.js';
import {
  CheckInOptionsController,
  CheckInsController,
} from './check-ins/check-ins.controller.js';
import {
  CheckInActionsController,
  CheckInActionStatusController,
} from './check-in-actions/check-in-actions.controller.js';
import { CheckInActionsService } from './check-in-actions/check-in-actions.service.js';
import { ForecastService } from './forecast/forecast.service.js';

@Module({
  imports: [],
  controllers: [
    CheckInsController,
    CheckInOptionsController,
    CheckInActionsController,
    CheckInActionStatusController,
  ],
  providers: [
    RuntimeConfig,
    Clock,
    PrismaService,
    CheckInsService,
    CheckInActionsService,
    ForecastService,
  ],
})
export class AppModule {}
