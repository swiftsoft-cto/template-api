import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AuditService, AuditMeta } from '../../audit/audit.service';
import { StorageClientService } from '../../_common/storage-client/storage-client.service';
import { TranscriptionShareLink } from './entities/transcriptor-share.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { CreateShareLinkDto } from './dtos/share.dto';

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

@Injectable()
export class ShareService {
  constructor(
    @InjectRepository(TranscriptionShareLink)
    private shareRepo: Repository<TranscriptionShareLink>,
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
    private audit: AuditService,
    private storage: StorageClientService,
  ) {}

  private toDto(t: Transcriptor) {
    return {
      id: t.id,
      title: t.title,
      sourceFileName: t.sourceFileName,
      createdAt: t.createdAt.toISOString(),
      durationSeconds: t.durationSeconds,
      durationFormatted: formatDuration(t.durationSeconds),
      segments: t.segments ?? [],
      tags: t.tags ?? [],
      speakerLabels: t.speakerLabels ?? {},
      diarizationEnabled: t.diarizationEnabled,
      status: t.status,
      errorMessage: t.errorMessage ?? null,
    };
  }

  async createShareLink(
    userId: string,
    transcriptionId: string,
    dto: CreateShareLinkDto,
    meta?: AuditMeta,
  ) {
    // Verifica se a transcrição pertence ao usuário
    const transcription = await this.transcriptionsRepo.findOne({
      where: { id: transcriptionId, userId, deletedAt: IsNull() },
    });
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const token = crypto.randomUUID();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.expiresAt && isNaN(expiresAt!.getTime()))
      throw new BadRequestException('expiresAt inválido');

    const now = new Date();
    const row: Partial<TranscriptionShareLink> = {
      token,
      transcriptionId,
      createdByUserId: userId,
      permission: dto.permission ?? 'read',
      expiresAt,
      createdAt: now as any,
      revokedAt: null,
    };
    await this.shareRepo.insert(row as any);

    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'transcription.share_link',
      entityId: token,
      before: null,
      after: { ...row, expiresAt: expiresAt?.toISOString() ?? null },
      meta,
    });

    return {
      token,
      url: `/share/${token}`,
      expiresAt: expiresAt?.toISOString() ?? null,
      permission: row.permission,
    };
  }

  async revokeShareLink(
    userId: string,
    transcriptionId: string,
    token: string,
    meta?: AuditMeta,
  ) {
    // Verifica se a transcrição pertence ao usuário
    const transcription = await this.transcriptionsRepo.findOne({
      where: { id: transcriptionId, userId, deletedAt: IsNull() },
    });
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const link = await this.shareRepo.findOne({
      where: {
        token,
        transcriptionId,
        createdByUserId: userId,
        revokedAt: IsNull() as any,
      },
    });
    if (!link) throw new NotFoundException('Share link não encontrado');

    await this.shareRepo.update({ token }, { revokedAt: new Date() as any });

    await this.audit.record({
      userId,
      action: 'DELETE',
      entity: 'transcription.share_link',
      entityId: token,
      before: link,
      after: { ...link, revokedAt: new Date().toISOString() },
      meta,
    });

    return { ok: true };
  }

  // ---------- Public Share Reads ----------

  async getSharedTranscription(token: string) {
    const link = await this.shareRepo.findOne({
      where: { token, revokedAt: IsNull() as any },
    });
    if (!link) throw new NotFoundException('Link inválido');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now())
      throw new NotFoundException('Link expirado');

    const tr = await this.transcriptionsRepo.findOne({
      where: { id: link.transcriptionId, deletedAt: IsNull() },
    });
    if (!tr) throw new NotFoundException('Transcrição não encontrada');

    return this.toDto(tr);
  }

  async streamSharedMedia(
    token: string,
    res: any,
    opts?: { download?: string; range?: string },
  ) {
    const link = await this.shareRepo.findOne({
      where: { token, revokedAt: IsNull() as any },
    });
    if (!link) throw new NotFoundException('Link inválido');
    if (link.expiresAt && link.expiresAt.getTime() < Date.now())
      throw new NotFoundException('Link expirado');

    const tr = await this.transcriptionsRepo.findOne({
      where: { id: link.transcriptionId, deletedAt: IsNull() },
    });
    if (!tr || !tr.storageFileId)
      throw new NotFoundException('Mídia não encontrada');
    await this.storage.pipeStreamToResponse(tr.storageFileId, res, opts);
  }
}
