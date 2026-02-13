import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { AuditService, AuditMeta } from '../../audit/audit.service';
import { TranscriptionSharedWith } from './entities/transcription-shared-with.entity';
import { TranscriptionFolderSharedWith } from './entities/transcription-folder-shared-with.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionFolder } from '../transcription-folders/entities/transcription-folder.entity';
import { User } from '../../administration/users/user.entity';
import {
  ShareTranscriptionWithUserDto,
  ShareFolderWithUserDto,
} from './dtos/transcription-shares.dto';

@Injectable()
export class TranscriptionSharesService {
  constructor(
    @InjectRepository(TranscriptionSharedWith)
    private sharedWithRepo: Repository<TranscriptionSharedWith>,
    @InjectRepository(TranscriptionFolderSharedWith)
    private folderSharedWithRepo: Repository<TranscriptionFolderSharedWith>,
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
    @InjectRepository(TranscriptionFolder)
    private folderRepo: Repository<TranscriptionFolder>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private audit: AuditService,
  ) {}

  /**
   * Compartilha uma transcrição com outro usuário.
   * Apenas o dono da transcrição pode compartilhar.
   */
  async share(
    ownerUserId: string,
    transcriptionId: string,
    dto: ShareTranscriptionWithUserDto,
    meta?: AuditMeta,
  ) {
    const transcription = await this.transcriptionsRepo.findOne({
      where: { id: transcriptionId, userId: ownerUserId, deletedAt: IsNull() },
    });
    if (!transcription) {
      throw new NotFoundException('Transcrição não encontrada');
    }

    if (dto.userId === ownerUserId) {
      throw new BadRequestException(
        'Não é possível compartilhar com você mesmo',
      );
    }

    const existing = await this.sharedWithRepo.findOne({
      where: {
        transcriptionId,
        sharedWithUserId: dto.userId,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Esta transcrição já está compartilhada com este usuário',
      );
    }

    const id = crypto.randomUUID();
    const row: Partial<TranscriptionSharedWith> = {
      id,
      transcriptionId,
      sharedWithUserId: dto.userId,
      createdByUserId: ownerUserId,
    };
    await this.sharedWithRepo.insert(row as any);

    await this.audit.record({
      userId: ownerUserId,
      action: 'CREATE',
      entity: 'transcription.shared_with',
      entityId: id,
      before: null,
      after: row,
      meta,
    });

    return {
      id,
      transcriptionId,
      sharedWithUserId: dto.userId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Remove o compartilhamento de uma transcrição com um usuário.
   */
  async unshare(
    ownerUserId: string,
    transcriptionId: string,
    sharedWithUserId: string,
    meta?: AuditMeta,
  ) {
    const transcription = await this.transcriptionsRepo.findOne({
      where: { id: transcriptionId, userId: ownerUserId, deletedAt: IsNull() },
    });
    if (!transcription) {
      throw new NotFoundException('Transcrição não encontrada');
    }

    const share = await this.sharedWithRepo.findOne({
      where: {
        transcriptionId,
        sharedWithUserId,
        createdByUserId: ownerUserId,
      },
    });
    if (!share) {
      throw new NotFoundException('Compartilhamento não encontrado');
    }

    await this.sharedWithRepo.delete({ id: share.id });

    await this.audit.record({
      userId: ownerUserId,
      action: 'DELETE',
      entity: 'transcription.shared_with',
      entityId: share.id,
      before: share,
      after: null,
      meta,
    });

    return { ok: true };
  }

  /**
   * Lista usuários com quem a transcrição está compartilhada.
   */
  async listSharedWith(ownerUserId: string, transcriptionId: string) {
    const transcription = await this.transcriptionsRepo.findOne({
      where: { id: transcriptionId, userId: ownerUserId, deletedAt: IsNull() },
    });
    if (!transcription) {
      throw new NotFoundException('Transcrição não encontrada');
    }

    const rows = await this.sharedWithRepo.find({
      where: { transcriptionId, createdByUserId: ownerUserId },
      order: { createdAt: 'ASC' as any },
    });

    const userIds = [...new Set(rows.map((r) => r.sharedWithUserId))];
    const users =
      userIds.length > 0
        ? await this.usersRepo.find({
            where: { id: In(userIds) },
            select: { id: true, name: true, email: true, avatarFileId: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      data: rows.map((r) => {
        const user = userMap.get(r.sharedWithUserId);
        return {
          id: r.id,
          sharedWithUserId: r.sharedWithUserId,
          createdAt: r.createdAt.toISOString(),
          user: user
            ? {
                name: user.name,
                email: user.email,
                imageUrl: user.avatarFileId
                  ? `/users/${r.sharedWithUserId}/avatar`
                  : null,
              }
            : null,
        };
      }),
    };
  }

  /**
   * Verifica se o usuário tem acesso à transcrição (dono, compartilhamento direto ou pasta compartilhada).
   */
  async hasAccess(
    userId: string,
    transcriptionId: string,
  ): Promise<Transcriptor | null> {
    const tr = await this.transcriptionsRepo.findOne({
      where: { id: transcriptionId, deletedAt: IsNull() },
    });
    if (!tr) return null;
    if (tr.userId === userId) return tr;

    const shared = await this.sharedWithRepo.findOne({
      where: { transcriptionId, sharedWithUserId: userId },
    });
    if (shared) return tr;

    if (tr.folderId) {
      const accessibleFolderIds =
        await this.getAccessibleFolderIdsViaFolderShare(userId);
      if (accessibleFolderIds.has(tr.folderId)) return tr;
    }

    return null;
  }

  /**
   * Retorna o conjunto de folder_id que o usuário enxerga por compartilhamento de pasta
   * (cada pasta compartilhada com ele + todas as subpastas).
   */
  private async getAccessibleFolderIdsViaFolderShare(
    userId: string,
  ): Promise<Set<string>> {
    const rows = await this.folderSharedWithRepo.find({
      where: { sharedWithUserId: userId },
      select: { folderId: true, createdByUserId: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      const ids = await this.getFolderAndDescendantIds(
        r.createdByUserId,
        r.folderId,
      );
      ids.forEach((id) => set.add(id));
    }
    return set;
  }

  /** Pasta + todos os IDs de subpastas (recursivo). */
  private async getFolderAndDescendantIds(
    ownerUserId: string,
    folderId: string,
  ): Promise<string[]> {
    const result: string[] = [folderId];
    const queue: string[] = [folderId];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await this.folderRepo.find({
        where: { parentId, userId: ownerUserId, deletedAt: IsNull() },
        select: { id: true },
      });
      for (const c of children) {
        result.push(c.id);
        queue.push(c.id);
      }
    }
    return result;
  }

  // ---------- Compartilhamento de pasta ----------

  /**
   * Compartilha uma pasta com outro usuário. Todo o conteúdo atual e futuro da pasta
   * (e subpastas) fica visível para o usuário alvo.
   */
  async shareFolder(
    ownerUserId: string,
    folderId: string,
    dto: ShareFolderWithUserDto,
    meta?: AuditMeta,
  ) {
    const folder = await this.folderRepo.findOne({
      where: { id: folderId, userId: ownerUserId, deletedAt: IsNull() },
    });
    if (!folder) {
      throw new NotFoundException('Pasta não encontrada');
    }

    if (dto.userId === ownerUserId) {
      throw new BadRequestException(
        'Não é possível compartilhar uma pasta com você mesmo',
      );
    }

    const existing = await this.folderSharedWithRepo.findOne({
      where: { folderId, sharedWithUserId: dto.userId },
    });
    if (existing) {
      throw new ConflictException(
        'Esta pasta já está compartilhada com este usuário',
      );
    }

    const id = crypto.randomUUID();
    const row: Partial<TranscriptionFolderSharedWith> = {
      id,
      folderId,
      sharedWithUserId: dto.userId,
      createdByUserId: ownerUserId,
    };
    await this.folderSharedWithRepo.insert(
      row as TranscriptionFolderSharedWith,
    );

    await this.audit.record({
      userId: ownerUserId,
      action: 'CREATE',
      entity: 'transcription_folder.shared_with',
      entityId: id,
      before: null,
      after: row,
      meta,
    });

    return {
      id,
      folderId,
      sharedWithUserId: dto.userId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Remove o compartilhamento de uma pasta com um usuário.
   */
  async unshareFolder(
    ownerUserId: string,
    folderId: string,
    sharedWithUserId: string,
    meta?: AuditMeta,
  ) {
    const folder = await this.folderRepo.findOne({
      where: { id: folderId, userId: ownerUserId, deletedAt: IsNull() },
    });
    if (!folder) {
      throw new NotFoundException('Pasta não encontrada');
    }

    const share = await this.folderSharedWithRepo.findOne({
      where: {
        folderId,
        sharedWithUserId,
        createdByUserId: ownerUserId,
      },
    });
    if (!share) {
      throw new NotFoundException('Compartilhamento da pasta não encontrado');
    }

    await this.folderSharedWithRepo.delete({ id: share.id });

    await this.audit.record({
      userId: ownerUserId,
      action: 'DELETE',
      entity: 'transcription_folder.shared_with',
      entityId: share.id,
      before: share,
      after: null,
      meta,
    });

    return { ok: true };
  }

  /**
   * Lista usuários com quem a pasta está compartilhada.
   */
  async listFolderSharedWith(ownerUserId: string, folderId: string) {
    const folder = await this.folderRepo.findOne({
      where: { id: folderId, userId: ownerUserId, deletedAt: IsNull() },
    });
    if (!folder) {
      throw new NotFoundException('Pasta não encontrada');
    }

    const rows = await this.folderSharedWithRepo.find({
      where: { folderId, createdByUserId: ownerUserId },
      order: { createdAt: 'ASC' as any },
    });

    const userIds = [...new Set(rows.map((r) => r.sharedWithUserId))];
    const users =
      userIds.length > 0
        ? await this.usersRepo.find({
            where: { id: In(userIds) },
            select: { id: true, name: true, email: true, avatarFileId: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      data: rows.map((r) => {
        const user = userMap.get(r.sharedWithUserId);
        return {
          id: r.id,
          sharedWithUserId: r.sharedWithUserId,
          createdAt: r.createdAt.toISOString(),
          user: user
            ? {
                name: user.name,
                email: user.email,
                imageUrl: user.avatarFileId
                  ? `/users/${r.sharedWithUserId}/avatar`
                  : null,
              }
            : null,
        };
      }),
    };
  }

  /**
   * Lista usuários que compartilharam pelo menos uma transcrição ou pasta comigo.
   * Uso: exibir "pastas" por usuário no front (José, Maria, ...).
   */
  async listUsersWhoSharedWithMe(myUserId: string): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      imageUrl: string | null;
    }>
  > {
    const [transcriptionRows, folderRows] = await Promise.all([
      this.sharedWithRepo
        .createQueryBuilder('sw')
        .innerJoin(
          'transcription',
          't',
          't.id = sw.transcription_id AND t.deleted_at IS NULL',
        )
        .where('sw.shared_with_user_id = :myUserId', { myUserId })
        .select('t.user_id', 'ownerId')
        .distinct(true)
        .getRawMany<{ ownerId: string }>(),
      this.folderSharedWithRepo.find({
        where: { sharedWithUserId: myUserId },
        select: { createdByUserId: true },
      }),
    ]);

    const ownerIds = new Set<string>([
      ...transcriptionRows.map((r) => r.ownerId),
      ...folderRows.map((r) => r.createdByUserId),
    ]);
    if (ownerIds.size === 0) return [];

    const users = await this.usersRepo.find({
      where: { id: In([...ownerIds]) },
      select: { id: true, name: true, email: true, avatarFileId: true },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      imageUrl: u.avatarFileId ? `/users/${u.id}/avatar` : null,
    }));
  }

  /**
   * IDs das pastas que o dono (ownerUserId) compartilhou comigo (myUserId), incluindo subpastas.
   * Usado no explorer "compartilhadas comigo" para decidir quais pastas exibir.
   */
  async getSharedFolderIdsWithDescendantsByOwner(
    myUserId: string,
    ownerUserId: string,
  ): Promise<Set<string>> {
    const rows = await this.folderSharedWithRepo.find({
      where: {
        sharedWithUserId: myUserId,
        createdByUserId: ownerUserId,
      },
      select: { folderId: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      const ids = await this.getFolderAndDescendantIds(ownerUserId, r.folderId);
      ids.forEach((id) => set.add(id));
    }
    return set;
  }

  /**
   * IDs das transcrições que o dono (ownerUserId) compartilhou comigo (myUserId):
   * compartilhamento direto de transcrição + transcrições dentro de pastas compartilhadas.
   */
  async getSharedTranscriptionIdsByOwner(
    myUserId: string,
    ownerUserId: string,
  ): Promise<string[]> {
    const [directRows, folderShares] = await Promise.all([
      this.sharedWithRepo
        .createQueryBuilder('sw')
        .innerJoin(
          'transcription',
          't',
          't.id = sw.transcription_id AND t.user_id = :ownerUserId AND t.deleted_at IS NULL',
          { ownerUserId },
        )
        .where('sw.shared_with_user_id = :myUserId', { myUserId })
        .select('sw.transcription_id', 'id')
        .getRawMany<{ id: string }>(),
      this.folderSharedWithRepo.find({
        where: {
          sharedWithUserId: myUserId,
          createdByUserId: ownerUserId,
        },
        select: { folderId: true },
      }),
    ]);

    const ids = new Set<string>(directRows.map((r) => r.id));

    if (folderShares.length > 0) {
      const folderIds = new Set<string>();
      for (const fs of folderShares) {
        const withDesc = await this.getFolderAndDescendantIds(
          ownerUserId,
          fs.folderId,
        );
        withDesc.forEach((id) => folderIds.add(id));
      }
      if (folderIds.size > 0) {
        const inFolders = await this.transcriptionsRepo.find({
          where: {
            userId: ownerUserId,
            folderId: In([...folderIds]),
            deletedAt: IsNull(),
          },
          select: { id: true },
        });
        inFolders.forEach((t) => ids.add(t.id));
      }
    }

    return [...ids];
  }
}
