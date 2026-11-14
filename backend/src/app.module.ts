import { Module } from '@nestjs/common';
import { RuntimeConfig } from './config.js';
import { Clock } from './common/clock.js';
import { PrismaService } from './prisma/prisma.service.js';
import { CheckInsService } from './check-ins/check-ins.service.js';
import {
  CheckInOptionsController,
  CheckInsController,
} from './check-ins/check-ins.controller.js';

@Module({
  imports: [],
  controllers: [CheckInsController, CheckInOptionsController],
  providers: [RuntimeConfig, Clock, PrismaService, CheckInsService],
})
export class AppModule {}
