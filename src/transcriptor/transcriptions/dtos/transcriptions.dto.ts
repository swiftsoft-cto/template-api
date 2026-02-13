import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ---------- Queries ----------

export class ListTranscriptionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @ValidateIf((o) => o.folderId != null && o.folderId !== '')
  @IsUUID()
  folderId?: string | null;
}

/** Query para o explorador (pastas + transcrições com caminho, estilo Windows). */
export class ExplorerQueryDto {
  @IsOptional()
  @ValidateIf((o) => o.folderId != null && o.folderId !== '')
  @IsUUID()
  folderId?: string | null;

  @IsOptional()
  @IsString()
  search?: string;
}

/** Query para o explorador "compartilhadas comigo" (por usuário que compartilhou). */
export class SharedWithMeExplorerQueryDto {
  @IsUUID()
  sharedByUserId!: string;

  @IsOptional()
  @ValidateIf((o) => o.folderId != null && o.folderId !== '')
  @IsUUID()
  folderId?: string | null;
}

/** Query para resolver transcrição por caminho (ex: Documentos\\Reuniões\\Título). */
export class ResolvePathQueryDto {
  @IsString()
  path!: string;
}

// ---------- Core ----------

export class UpdateTranscriptionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @ValidateIf((o) => o.folderId != null && o.folderId !== '')
  @IsUUID()
  folderId?: string | null;
}

export class UpsertTagsDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// ---------- Editing (segments / speakers) ----------

export class UpdateSegmentDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  speaker?: string;
}

export class BulkSegmentUpdateItemDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  speaker?: string;
}

export class BulkUpdateSegmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkSegmentUpdateItemDto)
  updates!: BulkSegmentUpdateItemDto[];
}

export class UpsertSpeakerLabelsDto {
  @IsObject()
  labels!: Record<string, string>;
}
