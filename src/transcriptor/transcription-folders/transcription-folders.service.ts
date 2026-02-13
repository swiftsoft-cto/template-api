import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import { TranscriptionFolder } from './entities/transcription-folder.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import {
  CreateTranscriptionFolderDto,
  UpdateTranscriptionFolderDto,
} from './dtos/transcription-folders.dto';

@Injectable()
export class TranscriptionFoldersService {
  constructor(
    @InjectRepository(TranscriptionFolder)
    private folderRepo: Repository<TranscriptionFolder>,
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
  ) {}

  async create(userId: string, dto: CreateTranscriptionFolderDto) {
    if (dto.name.includes('\\')) {
      throw new BadRequestException(
        'Nome da pasta não pode conter o caractere "\\".',
      );
    }
    if (dto.parentId) {
      const parent = await this.folderRepo.findOne({
        where: { id: dto.parentId, userId, deletedAt: IsNull() },
      });
      if (!parent)
        throw new BadRequestException(
          'Pasta pai não encontrada ou não pertence ao usuário.',
        );
    }

    const id = crypto.randomUUID();
    const folder = this.folderRepo.create({
      id,
      userId,
      name: dto.name.trim(),
      parentId: dto.parentId ?? null,
    });
    await this.folderRepo.insert(folder);
    const created = await this.folderRepo.findOne({ where: { id } });
    return this.toDto(created!);
  }

  async list(userId: string, parentId?: string | null) {
    const qb = this.folderRepo
      .createQueryBuilder('f')
      .where('f.user_id = :userId', { userId })
      .andWhere('f.deleted_at IS NULL');

    if (parentId === undefined || parentId === null || parentId === '') {
      qb.andWhere('f.parent_id IS NULL');
    } else {
      qb.andWhere('f.parent_id = :parentId', { parentId });
    }

    qb.orderBy('f.name', 'ASC');
    const folders = await qb.getMany();
    return folders.map((f) => this.toDto(f));
  }

  async get(userId: string, id: string) {
    const folder = await this.folderRepo.findOne({
      where: { id, userId, deletedAt: IsNull() },
    });
    if (!folder) throw new NotFoundException('Pasta não encontrada');
    return this.toDto(folder);
  }

  async update(userId: string, id: string, dto: UpdateTranscriptionFolderDto) {
    const folder = await this.requireOwnedFolder(userId, id);

    if (dto.parentId !== undefined) {
      if (dto.parentId === id)
        throw new BadRequestException('Pasta não pode ser pai de si mesma.');
      if (dto.parentId) {
        const parent = await this.folderRepo.findOne({
          where: { id: dto.parentId, userId, deletedAt: IsNull() },
        });
        if (!parent)
          throw new BadRequestException(
            'Pasta pai não encontrada ou não pertence ao usuário.',
          );
        // Evitar ciclo: não permitir mover para dentro de um descendente
        // (novo pai NÃO pode estar dentro da subárvore da pasta atual)
        const isDescendant = await this.isDescendantOf(
          userId,
          id, // ancestorId = pasta atual
          dto.parentId, // targetId = novo pai
        );
        if (isDescendant)
          throw new BadRequestException(
            'Não é possível mover a pasta para dentro de uma subpasta dela mesma.',
          );
      }
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.includes('\\')) {
        throw new BadRequestException(
          'Nome da pasta não pode conter o caractere "\\".',
        );
      }
      folder.name = name;
    }
    if (dto.parentId !== undefined) folder.parentId = dto.parentId ?? null;

    await this.folderRepo.save(folder);
    return this.toDto(folder);
  }

  async softDelete(userId: string, id: string) {
    const folder = await this.requireOwnedFolder(userId, id);
    const [childFoldersCount, transcriptionsCount] = await Promise.all([
      this.folderRepo.count({
        where: { parentId: id, deletedAt: IsNull() },
      }),
      this.transcriptionsRepo.count({
        where: { folderId: id, deletedAt: IsNull() },
      }),
    ]);
    if (childFoldersCount > 0 || transcriptionsCount > 0) {
      throw new BadRequestException(
        'Não é possível excluir a pasta: ela contém subpastas ou transcrições. Remova ou mova o conteúdo antes.',
      );
    }
    await this.folderRepo.softRemove(folder);
    return { ok: true };
  }

  /** Retorna o caminho da pasta (nomes dos ancestrais da raiz até a pasta), ex: ["Documentos", "Reuniões 2025"] */
  async getFolderPath(
    userId: string,
    folderId: string | null,
  ): Promise<string[]> {
    if (!folderId) return [];
    const path: string[] = [];
    let currentId: string | null = folderId;
    const seen = new Set<string>();

    while (currentId) {
      if (seen.has(currentId)) break;
      seen.add(currentId);
      const folder = await this.folderRepo.findOne({
        where: { id: currentId, userId, deletedAt: IsNull() },
        select: ['id', 'name', 'parentId'],
      });
      if (!folder) break;
      path.unshift(folder.name);
      currentId = folder.parentId;
    }
    return path;
  }

  /** Retorna o caminho como string no estilo Windows, ex: "Documentos\\Reuniões 2025" */
  async getFolderPathString(
    userId: string,
    folderId: string | null,
  ): Promise<string> {
    const path = await this.getFolderPath(userId, folderId);
    return path.join('\\');
  }

  /** Breadcrumb: lista de { id, name } da raiz até a pasta atual (vazio se raiz). Inclui "Raiz" como primeiro item. */
  async getFolderPathItems(
    userId: string,
    folderId: string | null,
  ): Promise<Array<{ id: string | null; name: string }>> {
    if (!folderId) return [{ id: null, name: 'Raiz' }];
    const path: Array<{ id: string; name: string }> = [];
    let currentId: string | null = folderId;
    const seen = new Set<string>();

    while (currentId) {
      if (seen.has(currentId)) break;
      seen.add(currentId);
      const folder = await this.folderRepo.findOne({
        where: { id: currentId, userId, deletedAt: IsNull() },
        select: ['id', 'name', 'parentId'],
      });
      if (!folder) break;
      path.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parentId;
    }
    return [{ id: null, name: 'Raiz' }, ...path];
  }

  /** Verifica se targetId é descendente de ancestorId (evitar ciclos). */
  private async isDescendantOf(
    userId: string,
    ancestorId: string,
    targetId: string,
  ): Promise<boolean> {
    let currentId: string | null = targetId;
    const seen = new Set<string>();

    while (currentId) {
      if (currentId === ancestorId) return true;
      if (seen.has(currentId)) return false;
      seen.add(currentId);
      const folder = await this.folderRepo.findOne({
        where: { id: currentId, userId, deletedAt: IsNull() },
        select: ['parentId'],
      });
      if (!folder) return false;
      currentId = folder.parentId;
    }
    return false;
  }

  /**
   * Resolve um caminho (ex: "Documentos\\Reuniões") e retorna a pasta correspondente.
   * Segmentos vazios são ignorados. Retorna 404 se qualquer segmento não existir.
   */
  async resolveByPath(
    userId: string,
    pathRaw: string,
  ): Promise<{
    type: 'folder';
    folder: {
      id: string;
      name: string;
      parentId: string | null;
      createdAt: string;
      updatedAt: string;
    };
    path: string[];
    pathString: string;
  }> {
    const segments = pathRaw
      .replace(/\//g, '\\')
      .split('\\')
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length === 0) {
      throw new NotFoundException(
        'Caminho inválido. Use o formato: Pasta1\\Pasta2 (path vazio ou só separadores).',
      );
    }
    let parentId: string | null = null;
    let folder: TranscriptionFolder | null = null;
    for (const name of segments) {
      const found = await this.folderRepo.findOne({
        where: { userId, parentId, name, deletedAt: IsNull() },
      });
      if (!found) {
        throw new NotFoundException(
          `Pasta não encontrada no caminho: "${segments.join('\\')}" (não existe "${name}" em ${parentId == null ? 'raiz' : 'essa pasta'}).`,
        );
      }
      folder = found;
      parentId = found.id;
    }
    const path = await this.getFolderPath(userId, folder!.id);
    const pathString = path.join('\\');
    return {
      type: 'folder',
      folder: this.toDto(folder!),
      path,
      pathString,
    };
  }

  async requireOwnedFolder(
    userId: string,
    id: string,
  ): Promise<TranscriptionFolder> {
    const folder = await this.folderRepo.findOne({
      where: { id, userId, deletedAt: IsNull() },
    });
    if (!folder) throw new NotFoundException('Pasta não encontrada');
    return folder;
  }

  toDto(f: TranscriptionFolder) {
    return {
      id: f.id,
      name: f.name,
      parentId: f.parentId ?? null,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    };
  }
}
