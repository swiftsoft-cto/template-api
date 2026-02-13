import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { AuditModule } from '../../audit/audit.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { TranscriptionInsight } from './entities/transcriptor-insight.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionSharesModule } from '../transcription-shares/transcription-shares.module';

@Module({
  imports: [
    RolesModule,
    AuditModule,
    TranscriptionSharesModule,
    TypeOrmModule.forFeature([TranscriptionInsight, Transcriptor]),
  ],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
