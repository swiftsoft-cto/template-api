import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { AuditModule } from '../../audit/audit.module';
import { AiModule } from '../../_ai/ai.module';
import { SummariesController } from './summaries.controller';
import { SummariesService } from './summaries.service';
import { TranscriptionSummary } from './entities/transcriptor-summary.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionSharesModule } from '../transcription-shares/transcription-shares.module';

@Module({
  imports: [
    RolesModule,
    AuditModule,
    AiModule,
    TranscriptionSharesModule,
    TypeOrmModule.forFeature([TranscriptionSummary, Transcriptor]),
  ],
  controllers: [SummariesController],
  providers: [SummariesService],
  exports: [SummariesService],
})
export class SummariesModule {}
