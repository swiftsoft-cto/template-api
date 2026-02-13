import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AuditService, AuditMeta } from '../../audit/audit.service';
import { TranscriptionInsight } from './entities/transcriptor-insight.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionSharesService } from '../transcription-shares/transcription-shares.service';
import { CreateInsightsDto } from './dtos/insights.dto';

@Injectable()
export class InsightsService {
  constructor(
    @InjectRepository(TranscriptionInsight)
    private insightsRepo: Repository<TranscriptionInsight>,
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
    private transcriptionSharesService: TranscriptionSharesService,
    private audit: AuditService,
  ) {}

  async get(userId: string, transcriptionId: string) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const rows = await this.insightsRepo.find({
      where: { transcriptionId, userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' as any },
      take: 100,
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        result: r.result,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async create(
    userId: string,
    transcriptionId: string,
    dto: CreateInsightsDto,
    meta?: AuditMeta,
  ) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const types = (
      dto.types?.length ? dto.types : ['topics', 'action_items']
    ).map((t) => t.trim());

    const createdIds: string[] = [];
    for (const type of types) {
      const id = crypto.randomUUID();
      createdIds.push(id);
      const insightNow = new Date();
      await this.insightsRepo.insert({
        id,
        transcriptionId,
        userId,
        type,
        status: 'done',
        result: { placeholder: true, type },
        errorMessage: null,
        createdAt: insightNow,
        deletedAt: null,
      } as any);

      await this.audit.record({
        userId,
        action: 'CREATE',
        entity: 'transcription.insight',
        entityId: id,
        before: null,
        after: { transcriptionId, type, status: 'done' },
        meta,
      });
    }

    return { ok: true, created: createdIds, types };
  }
}
