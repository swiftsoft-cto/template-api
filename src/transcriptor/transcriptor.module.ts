import { Module } from '@nestjs/common';
import { TranscriptionsModule } from './transcriptions/transcriptions.module';
import { TranscriptionFoldersModule } from './transcription-folders/transcription-folders.module';
import { IceBreakersModule } from './icebreakers/icebreakers.module';
import { CommentsModule } from './comments/comments.module';
import { ChatModule } from './chat/chat.module';
import { InsightsModule } from './insights/insights.module';
import { SummariesModule } from './summaries/summaries.module';
import { ShareModule } from './share/share.module';
import { TranscriptionSharesModule } from './transcription-shares/transcription-shares.module';

/**
 * Módulo principal do Transcriptor.
 * Organizado em submódulos para melhor manutenibilidade:
 *
 * - transcriptions: CRUD de transcrições, segments, speakers, tags e media
 * - transcription-folders: Pastas hierárquicas para organizar transcrições (estilo explorador)
 * - icebreakers: Perguntas quebra-gelo geradas automaticamente
 * - comments: Comentários em trechos da transcrição
 * - chat: Chat com a transcrição usando IA
 * - insights: Geração de insights (tópicos, action items, etc)
 * - summaries: Resumos personalizados da transcrição
 * - share: Links de compartilhamento público
 * - transcription-shares: Compartilhamento com usuários específicos (regra separada)
 */
@Module({
  imports: [
    TranscriptionsModule,
    TranscriptionFoldersModule,
    IceBreakersModule,
    CommentsModule,
    ChatModule,
    InsightsModule,
    SummariesModule,
    ShareModule,
    TranscriptionSharesModule,
  ],
})
export class TranscriptorModule {}
