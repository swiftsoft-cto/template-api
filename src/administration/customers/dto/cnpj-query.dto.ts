import { IsString, Matches } from 'class-validator';

export class CnpjQueryDto {
  @IsString()
  @Matches(/^\d{14}$/, { message: 'CNPJ deve conter exatamente 14 dígitos' })
  cnpj: string;
}
