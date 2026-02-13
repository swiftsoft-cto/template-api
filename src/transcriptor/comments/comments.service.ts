import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, In, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AuditService, AuditMeta } from '../../audit/audit.service';
import { TranscriptionComment } from './entities/transcriptor-comment.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { User } from '../../administration/users/user.entity';
import { TranscriptionSharesService } from '../transcription-shares/transcription-shares.service';
import { CreateCommentDto, UpdateCommentDto } from './dtos/comments.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(TranscriptionComment)
    private commentsRepo: Repository<TranscriptionComment>,
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private transcriptionSharesService: TranscriptionSharesService,
    private audit: AuditService,
  ) {}

  async list(userId: string, transcriptionId: string) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const rows = await this.commentsRepo.find({
      where: { transcriptionId, userId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' as any },
      take: 200,
    });

    const userIds = [...new Set(rows.map((c) => c.userId))];
    const users = await this.usersRepo.find({
      where: { id: In(userIds) },
      select: { id: true, name: true, avatarFileId: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      data: rows.map((c) => {
        const author = userMap.get(c.userId);
        return {
          id: c.id,
          transcriptionId: c.transcriptionId,
          userId: c.userId,
          userName: author?.name ?? null,
          avatarPath: author?.avatarFileId ? `/users/${c.userId}/avatar` : null,
          text: c.text,
          atSeconds: c.atSeconds,
          segmentId: c.segmentId,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
    };
  }

  async create(
    userId: string,
    transcriptionId: string,
    dto: CreateCommentDto,
    meta?: AuditMeta,
  ) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    if (!dto.text?.trim()) throw new BadRequestException('text é obrigatório');

    const id = crypto.randomUUID();
    const now = new Date();
    const row: Partial<TranscriptionComment> = {
      id,
      userId,
      transcriptionId,
      text: dto.text.trim(),
      atSeconds: dto.atSeconds ?? null,
      segmentId: dto.segmentId ?? null,
      createdAt: now as any,
      updatedAt: now as any,
      deletedAt: null,
    };
    await this.commentsRepo.insert(row as any);
    const created = await this.commentsRepo.findOne({ where: { id } });

    const author = await this.usersRepo.findOne({
      where: { id: userId },
      select: { id: true, name: true, avatarFileId: true },
    });

    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'transcription.comment',
      entityId: id,
      before: null,
      after: created ?? row,
      meta,
    });

    return {
      id,
      transcriptionId,
      userId,
      userName: author?.name ?? null,
      avatarPath: author?.avatarFileId ? `/users/${userId}/avatar` : null,
      text: row.text,
      atSeconds: row.atSeconds,
      segmentId: row.segmentId,
    };
  }

  async update(
    userId: string,
    transcriptionId: string,
    commentId: string,
    dto: UpdateCommentDto,
    meta?: AuditMeta,
  ) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const existing = await this.commentsRepo.findOne({
      where: {
        id: commentId,
        transcriptionId,
        userId,
        deletedAt: IsNull() as any,
      },
    });
    if (!existing) throw new NotFoundException('Comentário não encontrado');
    const before = { ...existing };

    const patch: Partial<TranscriptionComment> = {};
    if (dto.text !== undefined) patch.text = dto.text.trim();
    if (dto.atSeconds !== undefined) patch.atSeconds = dto.atSeconds ?? null;
    if (dto.segmentId !== undefined) patch.segmentId = dto.segmentId ?? null;

    await this.commentsRepo.update({ id: commentId }, patch as any);
    const updated = await this.commentsRepo.findOne({
      where: { id: commentId },
    });

    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'transcription.comment',
      entityId: commentId,
      before,
      after: updated ?? patch,
      meta,
    });

    return { ok: true };
  }

  async delete(
    userId: string,
    transcriptionId: string,
    commentId: string,
    meta?: AuditMeta,
  ) {
    const transcription = await this.transcriptionSharesService.hasAccess(
      userId,
      transcriptionId,
    );
    if (!transcription) {
      throw new BadRequestException('Transcrição não encontrada');
    }

    const existing = await this.commentsRepo.findOne({
      where: {
        id: commentId,
        transcriptionId,
        userId,
        deletedAt: IsNull() as any,
      },
    });
    if (!existing) throw new NotFoundException('Comentário não encontrado');

    await this.commentsRepo.update(
      { id: commentId },
      { deletedAt: new Date() as any },
    );

    await this.audit.record({
      userId,
      action: 'DELETE',
      entity: 'transcription.comment',
      entityId: commentId,
      before: existing,
      after: { ...existing, deletedAt: new Date().toISOString() },
      meta,
    });

    return { ok: true };
  }
}
