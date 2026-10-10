//ais.module.ts


import { Module } from '@nestjs/common';
import { AisController } from './ais.controller';
import { AisService } from './ais.service';
import { AisClientService } from './ais-client.service';
import { AisSyncService } from './ais-sync.service';
import { AisProgressService } from './ais-progress.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AisController],
  providers: [AisService, AisClientService, AisSyncService, AisProgressService, PrismaService],
  exports: [AisService, AisProgressService],
})
export class AisModule {}
