import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListProjectsDto {
  @IsOptional()
  @IsString()
  q?: string; // termo de busca

  // alias opcional, para compat com ?search=
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1; // página atual

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20; // itens por página

  @IsOptional()
  @IsString()
  orderBy?: 'createdAt' | 'updatedAt' | 'projectName' | 'projectCode' =
    'createdAt';

  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  customerId?: string; // filtrar por cliente
}
