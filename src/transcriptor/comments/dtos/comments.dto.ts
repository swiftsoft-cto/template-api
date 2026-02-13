import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCommentDto {
  @IsString()
  text: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  atSeconds?: number;

  @IsOptional()
  @IsString()
  segmentId?: string;
}

export class UpdateCommentDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  atSeconds?: number;

  @IsOptional()
  @IsString()
  segmentId?: string;
}
