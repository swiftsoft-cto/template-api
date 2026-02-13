import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AuditService, AuditMeta } from '../../audit/audit.service';
import { AiOrchestratorService } from '../../_ai/ai-orchestrator.service';
import { TranscriptionIceBreaker } from './entities/transcriptor-ice-breaker.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionSharesService } from '../transcription-shares/transcription-shares.service';
import { GenerateIceBreakersDto } from './dtos/icebreakers.dto';

@Injectable()
export class IceBreakersService {
  private readonly logger = new Logger(IceBreakersService.name);

  constructor(
    @InjectRepository(TranscriptionIceBreaker)
    private iceBreakersRepo: Repository<TranscriptionIceBreaker>,
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
    private transcriptionSharesService: TranscriptionSharesService,
    private audit: AuditService,
    private aiOrchestrator: AiOrchestratorService,
  ) {}

  /**
   * Verifica se já existem ice breakers para uma transcrição.
   * Método público usado pela geração automática.
   */
  async hasIceBreakers(transcriptionId: string): Promise<boolean> {
    const count = await this.iceBreakersRepo.count({
      where: { transcriptionId, deletedAt: IsNull() },
    });
    return count > 0;
  }

  async list(userId: string, transcriptionId: string) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const rows = await this.iceBreakersRepo.find({
      where: {
        transcriptionId,
        status: 'active',
        deletedAt: IsNull(),
      },
      order: { order: 'ASC' as any },
    });
    return {
      data: rows.map((ib) => ({
        id: ib.id,
        transcriptionId: ib.transcriptionId,
        question: ib.question,
        order: ib.order,
        createdAt: ib.createdAt.toISOString(),
      })),
    };
  }

  async generate(
    userId: string,
    transcriptionId: string,
    dto: GenerateIceBreakersDto,
    meta: AuditMeta,
  ) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );

    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    if (transcription.status !== 'done') {
      throw new BadRequestException(
        'A transcrição precisa estar concluída para gerar quebra-gelos',
      );
    }

    // Verifica se já existem ice breakers
    const existing = await this.iceBreakersRepo.count({
      where: { transcriptionId, deletedAt: IsNull() },
    });

    if (existing > 0) {
      // Remove os existentes antes de gerar novos
      await this.iceBreakersRepo.update(
        { transcriptionId },
        { deletedAt: new Date() as any },
      );
    }

    const count = dto.count || 5;

    // Monta o contexto da transcrição
    const segments = transcription.segments || [];
    const transcriptText = segments
      .map((seg) => {
        const speaker = seg.speaker
          ? `${transcription.speakerLabels?.[seg.speaker] || seg.speaker}: `
          : '';
        return `${speaker}${seg.text}`;
      })
      .join('\n');

    // Limita o tamanho do texto para não estourar o limite de tokens
    const maxChars = 50000;
    const limitedText =
      transcriptText.length > maxChars
        ? transcriptText.slice(0, maxChars) + '\n[...texto truncado...]'
        : transcriptText;

    // Prompt para a LLM
    const prompt = `Você é um assistente que analisa transcrições de áudio/vídeo e gera perguntas interessantes que podem ser feitas sobre o conteúdo.

Transcrição:
"""
${limitedText}
"""

Gere EXATAMENTE ${count} perguntas quebra-gelo (ice breakers) que um usuário poderia fazer sobre esta transcrição.

As perguntas devem:
- Ser específicas ao conteúdo da transcrição
- Ajudar o usuário a explorar pontos importantes do conteúdo
- Ser variadas (diferentes aspectos do conteúdo)
- Ser diretas e claras
- Não mencionar "na transcrição" ou "no áudio/vídeo" (apenas pergunte sobre o conteúdo)

Retorne no formato JSON:
{
  "questions": [
    "Primeira pergunta aqui?",
    "Segunda pergunta aqui?",
    ...
  ]
}`;

    this.logger.log(
      `[Ice Breakers] Gerando ${count} perguntas para transcrição ${transcriptionId}`,
    );

    let result: any;
    try {
      result = await this.aiOrchestrator.generateStrictJson(
        prompt,
        'gpt-4.1-mini',
        {
          maxTokens: 1000,
          temperature: 0.7,
          userId,
          callName: 'transcription.icebreakers.generate',
        },
      );
    } catch (error) {
      this.logger.error(
        `[Ice Breakers] Erro ao gerar perguntas: ${error?.message || error}`,
      );
      throw new InternalServerErrorException(
        'Falha ao gerar perguntas quebra-gelo',
      );
    }

    const questions = result?.questions || [];
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new InternalServerErrorException(
        'LLM não retornou perguntas válidas',
      );
    }

    // Salva os ice breakers no banco
    const iceBreakers: TranscriptionIceBreaker[] = [];
    for (let i = 0; i < questions.length; i++) {
      const id = crypto.randomUUID();
      const question = String(questions[i] || '').trim();
      if (!question) continue;

      const row: Partial<TranscriptionIceBreaker> = {
        id,
        transcriptionId,
        question,
        order: i,
        status: 'active',
        createdAt: new Date() as any,
      };

      await this.iceBreakersRepo.insert(row as any);
      iceBreakers.push(row as TranscriptionIceBreaker);
    }

    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'transcription.icebreakers',
      entityId: transcriptionId,
      before: null,
      after: { count: iceBreakers.length, questions },
      meta,
    });

    this.logger.log(
      `[Ice Breakers] ${iceBreakers.length} perguntas geradas para transcrição ${transcriptionId}`,
    );

    return {
      data: iceBreakers.map((ib) => ({
        id: ib.id,
        transcriptionId: ib.transcriptionId,
        question: ib.question,
        order: ib.order,
        createdAt: ib.createdAt.toISOString(),
      })),
    };
  }
}
