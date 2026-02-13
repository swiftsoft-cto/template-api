import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { AuditModule } from '../../audit/audit.module';
import { AiModule } from '../../_ai/ai.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import {
  TranscriptionChatThread,
  TranscriptionChatMessage,
} from './entities/transcriptor-chat.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionSegmentVector } from '../transcriptions/entities/transcription-segment-vector.entity';
import { TranscriptionSharesModule } from '../transcription-shares/transcription-shares.module';

@Module({
  imports: [
    RolesModule,
    AuditModule,
    AiModule,
    TranscriptionSharesModule,
    TypeOrmModule.forFeature([
      TranscriptionChatThread,
      TranscriptionChatMessage,
      Transcriptor,
      TranscriptionSegmentVector,
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
