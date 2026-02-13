import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateIceBreakersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(10)
  count?: number; // quantidade de perguntas, padrão 5
}
