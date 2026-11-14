import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { RuntimeConfig } from '../config.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(RuntimeConfig) config: RuntimeConfig) {
    super({ datasourceUrl: config.databaseUrl });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
