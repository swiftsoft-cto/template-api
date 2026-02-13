import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateShareLinkDto {
  @IsOptional()
  @IsString()
  expiresAt?: string; // ISO

  @IsOptional()
  @IsIn(['read', 'comment'])
  permission?: 'read' | 'comment';
}
