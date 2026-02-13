import { IsString } from 'class-validator';

export class GenerateSummaryDto {
  @IsString()
  prompt: string;
}
