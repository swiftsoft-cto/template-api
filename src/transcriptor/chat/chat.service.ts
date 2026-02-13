import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AuditService, AuditMeta } from '../../audit/audit.service';
import { AiOrchestratorService } from '../../_ai/ai-orchestrator.service';
import {
  ChatCitation,
  TranscriptionChatMessage,
  TranscriptionChatThread,
} from './entities/transcriptor-chat.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { ChatMessageDto } from './dtos/chat.dto';
import { TranscriptionSegmentVector } from '../transcriptions/entities/transcription-segment-vector.entity';
import { TranscriptionSharesService } from '../transcription-shares/transcription-shares.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(TranscriptionChatThread)
    private chatThreadsRepo: Repository<TranscriptionChatThread>,
    @InjectRepository(TranscriptionChatMessage)
    private chatMessagesRepo: Repository<TranscriptionChatMessage>,
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
    @InjectRepository(TranscriptionSegmentVector)
    private segmentVectorsRepo: Repository<TranscriptionSegmentVector>,
    private transcriptionSharesService: TranscriptionSharesService,
    private audit: AuditService,
    private aiOrchestrator: AiOrchestratorService,
  ) {}

  async listThreads(userId: string, transcriptionId: string) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const rows = await this.chatThreadsRepo.find({
      where: { transcriptionId, userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' as any },
      take: 50,
    });
    return {
      data: rows.map((t) => ({
        id: t.id,
        transcriptionId: t.transcriptionId,
        title: t.title,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  async listMessages(
    userId: string,
    transcriptionId: string,
    threadId: string,
  ) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const thread = await this.chatThreadsRepo.findOne({
      where: {
        id: threadId,
        transcriptionId,
        userId,
        deletedAt: IsNull() as any,
      },
    });
    if (!thread) throw new NotFoundException('Thread não encontrada');

    const rows = await this.chatMessagesRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' as any },
      take: 500,
    });
    return {
      data: rows.map((m) => ({
        id: m.id,
        role: m.role,
        message: m.message,
        citations: m.citations ?? [],
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  private async ensureThread(
    userId: string,
    transcriptionId: string,
    threadId?: string,
  ): Promise<TranscriptionChatThread> {
    if (threadId) {
      const t = await this.chatThreadsRepo.findOne({
        where: {
          id: threadId,
          userId,
          transcriptionId,
          deletedAt: IsNull() as any,
        },
      });
      if (!t) throw new NotFoundException('Thread não encontrada');
      return t;
    }
    const id = crypto.randomUUID();
    const now = new Date();
    const row: Partial<TranscriptionChatThread> = {
      id,
      userId,
      transcriptionId,
      title: null,
      createdAt: now as any,
      deletedAt: null,
    };
    await this.chatThreadsRepo.insert(row as any);
    const created = await this.chatThreadsRepo.findOne({ where: { id } });
    if (!created) throw new BadRequestException('Falha ao criar thread');
    return created;
  }

  private toPgVectorString(v: number[]): string {
    const arr = Array.isArray(v) ? v : [];
    return `[${arr.map((n) => Number(n).toString()).join(',')}]`;
  }

  /** Converte "HH:MM:SS" em segundos para matching de citações. */
  private hmsToSeconds(hms: string): number {
    const parts = hms.trim().split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
  }

  /**
   * Busca trechos relevantes da transcrição baseado na pergunta do usuário.
   * ✅ Implementação com embeddings + pgvector.
   *
   * Estratégia:
   * 1) gera embedding da pergunta
   * 2) busca topK por similaridade no Postgres (pgvector)
   * 3) expande janela de contexto (±window) usando o array original tr.segments
   * 4) ordena por índice para manter leitura natural
   *
   * Fallback:
   * - se não houver vetores indexados ainda, usa os primeiros N (com log)
   */
  private async getRelevantSegments(
    transcription: Transcriptor,
    userId: string,
    userMessage: string,
    limit = 50,
  ) {
    const segments = Array.isArray(transcription.segments)
      ? transcription.segments
      : [];
    if (!segments.length) return [];

    const topK = Math.max(
      1,
      Math.min(Number(process.env.AI_RAG_TOP_K ?? 10), 50),
    );
    const window = Math.max(
      0,
      Math.min(Number(process.env.AI_RAG_WINDOW ?? 2), 10),
    );

    try {
      const qEmb = await this.aiOrchestrator.generateEmbedding(userMessage, {
        userId,
        callName: 'transcription.chat.query.embedding',
      });

      const qVec = this.toPgVectorString(qEmb);

      // Busca topK índices por similaridade (cosine distance: <=>)
      const rows = (await this.segmentVectorsRepo.query(
        `
        SELECT segment_id, segment_index
        FROM transcription_segment_vector
        WHERE transcription_id = $1 AND user_id = $2 AND embedding IS NOT NULL
        ORDER BY embedding <=> $3::vector
        LIMIT $4
        `,
        [transcription.id, userId, qVec, topK],
      )) as Array<{ segment_id: string; segment_index: number }>;

      if (!rows?.length) {
        this.logger.log(
          `[Chat RAG] Sem vetores indexados para ${transcription.id}. Fallback primeiros ${limit}.`,
        );
        return segments.slice(0, limit);
      }

      // ✅ Expande janela por hit e faz união (evita "range gigante" quando hits são distantes)
      const pickedIdx = new Set<number>();
      for (const r of rows) {
        const idx = Number(r.segment_index);
        if (!Number.isFinite(idx)) continue;
        const a = Math.max(0, idx - window);
        const b = Math.min(segments.length - 1, idx + window);
        for (let i = a; i <= b; i++) pickedIdx.add(i);
      }

      const ordered = Array.from(pickedIdx).sort((a, b) => a - b);
      const picked = ordered.slice(0, limit).map((i) => segments[i]);
      return picked;
    } catch (e: any) {
      this.logger.error(
        `[Chat RAG] Falha na busca vetorial: ${e?.message || e}. Fallback primeiros ${limit}.`,
      );
      return segments.slice(0, limit);
    }
  }

  /**
   * Monta o contexto da transcrição formatado para o prompt.
   */
  private buildTranscriptionContext(
    transcription: Transcriptor,
    segments: any[],
  ): string {
    const lines: string[] = [];

    lines.push('# TRANSCRIÇÃO');
    lines.push(`Título: ${transcription.title}`);
    lines.push(`Duração: ${transcription.durationSeconds}s`);
    lines.push('');
    lines.push('## Trechos:');
    lines.push('');

    for (const seg of segments) {
      const speaker = seg.speaker
        ? `${transcription.speakerLabels?.[seg.speaker] || seg.speaker}: `
        : '';
      lines.push(`[${seg.startTime} - ${seg.endTime}] ${speaker}${seg.text}`);
    }

    return lines.join('\n');
  }

  /**
   * Monta o histórico do chat formatado para o prompt.
   */
  private buildChatHistory(messages: TranscriptionChatMessage[]): string {
    if (!messages.length) return '';

    const lines: string[] = [];
    lines.push('# HISTÓRICO DA CONVERSA');
    lines.push('');

    for (const msg of messages) {
      const role = msg.role === 'user' ? 'Usuário' : 'Assistente';
      lines.push(`${role}: ${msg.message}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  async chat(
    userId: string,
    transcriptionId: string,
    dto: ChatMessageDto,
    meta?: AuditMeta,
  ) {
    const tr = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!tr) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    if (!dto.message?.trim())
      throw new BadRequestException('message é obrigatório');

    const thread = await this.ensureThread(
      userId,
      transcriptionId,
      dto.threadId,
    );

    // Salva a mensagem do usuário
    const userMsgId = crypto.randomUUID();
    const msgNow = new Date();
    await this.chatMessagesRepo.insert({
      id: userMsgId,
      threadId: thread.id,
      role: 'user',
      message: dto.message.trim(),
      citations: null,
      createdAt: msgNow,
    } as any);

    // Busca as últimas 20 mensagens (contexto recente)
    const previousMessages = await this.chatMessagesRepo.find({
      where: { threadId: thread.id },
      order: { createdAt: 'DESC' as any },
      take: 20,
    });

    // Remove a mensagem recém-inserida e restaura ordem cronológica para o prompt
    const historyMessages = previousMessages
      .filter((m) => m.id !== userMsgId)
      .reverse();

    // Busca segmentos relevantes da transcrição
    const relevantSegments = await this.getRelevantSegments(
      tr,
      userId,
      dto.message.trim(),
      50,
    );

    // Monta o prompt com RAG (Retrieval Augmented Generation)
    const transcriptionContext = this.buildTranscriptionContext(
      tr,
      relevantSegments,
    );
    const chatHistory = this.buildChatHistory(historyMessages);

    const prompt = `Você é um assistente especializado em analisar transcrições de áudio/vídeo.

${transcriptionContext}

${chatHistory}

# INSTRUÇÕES
- Responda APENAS com base na transcrição fornecida acima
- Se a pergunta não puder ser respondida com as informações disponíveis, diga isso claramente
- Cite timestamps específicos quando relevante (formato: [HH:MM:SS])
- Seja direto e objetivo
- Mantenha o contexto da conversa anterior

# PERGUNTA DO USUÁRIO
${dto.message.trim()}

Responda:`;

    this.logger.log(
      `[Chat RAG] Gerando resposta para thread ${thread.id} com ${relevantSegments.length} segmentos`,
    );

    let assistantText: string;
    const citations: ChatCitation[] = [];

    try {
      // Usa o AiOrchestratorService para gerar a resposta
      assistantText = await this.aiOrchestrator.generateStrictText(
        prompt,
        'gpt-4o-mini', // Modelo rápido e barato para chat
        {
          maxTokens: 1000,
          userId,
          callName: 'transcription.chat',
        },
      );

      // Extrai citações dos timestamps mencionados na resposta
      // Regex para encontrar [HH:MM:SS] na resposta
      const timestampRegex = /\[(\d{1,2}:\d{2}:\d{2})\]/g;
      const matches = assistantText.matchAll(timestampRegex);

      const citedTimes = new Set<string>();
      for (const match of matches) {
        citedTimes.add(match[1]);
      }

      // Encontra os segmentos correspondentes aos timestamps citados
      // (LLM pode citar horário no meio do segmento, ex: [00:12:34] com segmento 00:12:30-00:12:40)
      for (const time of citedTimes) {
        const tSec = this.hmsToSeconds(time);
        const segment = relevantSegments.find((s) => {
          const startSec = this.hmsToSeconds(s.startTime);
          const endSec = s.endTime ? this.hmsToSeconds(s.endTime) : startSec;
          return tSec >= startSec && tSec <= endSec;
        });
        if (segment) {
          citations.push({
            segmentId: segment.id,
            startTime: segment.startTime,
            endTime: segment.endTime,
            snippet: segment.text?.slice(0, 200), // Primeiros 200 chars
          });
        }
      }

      this.logger.log(
        `[Chat RAG] Resposta gerada com ${citations.length} citações`,
      );
    } catch (error) {
      this.logger.error(
        `[Chat RAG] Erro ao gerar resposta: ${error?.message || error}`,
      );
      assistantText =
        'Desculpe, ocorreu um erro ao processar sua pergunta. Por favor, tente novamente.';
    }

    // Salva a resposta do assistente
    const assistantMsgId = crypto.randomUUID();
    await this.chatMessagesRepo.insert({
      id: assistantMsgId,
      threadId: thread.id,
      role: 'assistant',
      message: assistantText,
      citations: citations.length ? citations : null,
      createdAt: new Date(),
    } as any);

    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'transcription.chat.message',
      entityId: userMsgId,
      before: null,
      after: {
        transcriptionId,
        threadId: thread.id,
        role: 'user',
        message: dto.message.trim(),
      },
      meta,
    });

    return {
      threadId: thread.id,
      assistant: {
        message: assistantText,
        citations,
      },
    };
  }

  /**
   * Deleta um thread de chat (soft delete).
   * Remove o thread e todas as suas mensagens.
   */
  async deleteThread(
    userId: string,
    transcriptionId: string,
    threadId: string,
    meta?: AuditMeta,
  ) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    // Busca o thread
    const thread = await this.chatThreadsRepo.findOne({
      where: {
        id: threadId,
        transcriptionId,
        userId,
        deletedAt: IsNull() as any,
      },
    });
    if (!thread) throw new NotFoundException('Thread não encontrado');

    // Soft delete do thread
    await this.chatThreadsRepo.update(
      { id: threadId },
      { deletedAt: new Date() as any },
    );

    // Nota: As mensagens não têm soft delete, mas podem ser acessadas pelo threadId
    // Se quiser, você pode adicionar uma lógica para "marcar" as mensagens como deletadas
    // ou simplesmente deixar que fiquem órfãs (não serão mais acessíveis via thread)

    await this.audit.record({
      userId,
      action: 'DELETE',
      entity: 'transcription.chat.thread',
      entityId: threadId,
      before: thread,
      after: { ...thread, deletedAt: new Date().toISOString() },
      meta,
    });

    this.logger.log(
      `[Chat] Thread ${threadId} deletado (soft delete) por usuário ${userId}`,
    );

    return { ok: true, message: 'Thread deletado com sucesso' };
  }
}
