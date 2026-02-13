import { IsOptional, IsString, IsBoolean, IsEmail } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Campos de pessoa (quando customer.kind === PERSON)
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsString()
  rg?: string;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
