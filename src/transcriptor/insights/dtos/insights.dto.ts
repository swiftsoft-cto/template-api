import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateInsightsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];
}
