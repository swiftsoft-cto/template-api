import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { AuditModule } from '../../audit/audit.module';
import { AiModule } from '../../_ai/ai.module';
import { AiUsageModule } from '../../_ai/ai-usage.module';
import { StorageClientModule } from '../../_common/storage-client/storage-client.module';
import { TranscriptorMulterExceptionFilter } from '../../_common/filters/transcriptor-multer-exception.filter';
import { TranscriptionsController } from './transcriptions.controller';
import { TranscriptionsService } from './transcriptions.service';
import { Transcriptor } from './entities/transcriptor.entity';
import { TranscriptionSegmentVector } from './entities/transcription-segment-vector.entity';
import { IceBreakersModule } from '../icebreakers/icebreakers.module';
import { MeetModule } from '../meet/meet.module';
import { TranscriptionSharesModule } from '../transcription-shares/transcription-shares.module';
import { TranscriptionFoldersModule } from '../transcription-folders/transcription-folders.module';

@Module({
  imports: [
    ConfigModule,
    RolesModule,
    AuditModule,
    AiModule,
    AiUsageModule,
    StorageClientModule,
    forwardRef(() => IceBreakersModule), // Import IceBreakers para gerar automaticamente
    MeetModule,
    TranscriptionSharesModule,
    TranscriptionFoldersModule,
    TypeOrmModule.forFeature([Transcriptor, TranscriptionSegmentVector]),
  ],
  controllers: [TranscriptionsController],
  providers: [TranscriptionsService, TranscriptorMulterExceptionFilter],
  exports: [TranscriptionsService],
})
export class TranscriptionsModule {}
