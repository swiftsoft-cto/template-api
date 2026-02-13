import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTranscriptionFolderDto {
  @IsString()
  @MaxLength(500)
  name!: string;

  @IsOptional()
  @ValidateIf((o) => o.parentId != null && o.parentId !== '')
  @IsUUID()
  parentId?: string | null;
}

export class UpdateTranscriptionFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  name?: string;

  @IsOptional()
  @ValidateIf((o) => o.parentId != null && o.parentId !== '')
  @IsUUID()
  parentId?: string | null;
}

export class ListTranscriptionFoldersQueryDto {
  @IsOptional()
  @ValidateIf((o) => o.parentId != null && o.parentId !== '')
  @IsUUID()
  parentId?: string | null;
}

export class ResolvePathQueryDto {
  @IsString()
  path!: string;
}
