import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AuditService, AuditMeta } from '../../audit/audit.service';
import { AiOrchestratorService } from '../../_ai/ai-orchestrator.service';
import { TranscriptionSummary } from './entities/transcriptor-summary.entity';
import {
  Transcriptor,
  TranscriptionSegment,
} from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionSharesService } from '../transcription-shares/transcription-shares.service';
import { GenerateSummaryDto } from './dtos/summaries.dto';

@Injectable()
export class SummariesService {
  private readonly logger = new Logger(SummariesService.name);

  constructor(
    @InjectRepository(TranscriptionSummary)
    private summariesRepo: Repository<TranscriptionSummary>,
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
    private transcriptionSharesService: TranscriptionSharesService,
    private audit: AuditService,
    private aiOrchestrator: AiOrchestratorService,
  ) {}

  async list(userId: string, transcriptionId: string) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const rows = await this.summariesRepo.find({
      where: { transcriptionId, userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' as any },
      take: 50,
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        transcriptionId: r.transcriptionId,
        prompt: r.prompt,
        markdown: r.markdown,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Monta o contexto da transcrição formatado para o prompt.
   */
  private buildTranscriptionContext(
    transcription: Transcriptor,
    segments: TranscriptionSegment[],
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

  async generate(
    userId: string,
    transcriptionId: string,
    dto: GenerateSummaryDto,
    meta?: AuditMeta,
  ) {
    const t = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!t) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    if (!dto.prompt?.trim())
      throw new BadRequestException('prompt é obrigatório');

    const segments = t.segments ?? [];
    const relevantSegments = segments.slice(0, 50);

    const transcriptionContext = this.buildTranscriptionContext(
      t,
      relevantSegments,
    );

    const prompt = `IMPORTANTE: Para esta tarefa, retorne o resumo APENAS em Markdown (use # ## ### para títulos, - para listas, ** para negrito). O resultado será renderizado diretamente como Markdown.

Você é um assistente especializado em criar resumos de transcrições de áudio/vídeo.

${transcriptionContext}

# INSTRUÇÕES
- Crie um resumo com base na transcrição acima
- Siga EXATAMENTE o que o usuário pediu no prompt abaixo
- Cite timestamps quando relevante (formato: [HH:MM:SS])
- Retorne APENAS o Markdown do resumo, sem explicações adicionais

# PROMPT DO USUÁRIO
${dto.prompt.trim()}

Resumo em Markdown:`;

    let markdown: string;

    try {
      markdown = await this.aiOrchestrator.generateStrictText(
        prompt,
        'gpt-4o-mini',
        {
          userId,
          callName: 'transcription.summary',
        },
      );

      if (!markdown?.trim()) {
        markdown = '*Nenhum conteúdo gerado. Tente novamente.*';
      }
    } catch (error) {
      this.logger.error(
        `[Summary] Erro ao gerar resumo: ${error?.message || error}`,
      );
      markdown =
        '*Desculpe, ocorreu um erro ao gerar o resumo. Por favor, tente novamente.*';
    }

    const sumId = crypto.randomUUID();
    const now = new Date();
    const row: Partial<TranscriptionSummary> = {
      id: sumId,
      userId,
      transcriptionId,
      prompt: dto.prompt.trim(),
      markdown,
      createdAt: now as any,
      deletedAt: null,
    };

    await this.summariesRepo.insert(row as any);

    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'transcription.summary',
      entityId: sumId,
      before: null,
      after: {
        transcriptionId,
        prompt: row.prompt,
        markdown: row.markdown,
      },
      meta,
    });

    return { markdown };
  }
}
