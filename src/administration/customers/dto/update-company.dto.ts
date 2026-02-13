import { IsOptional, IsString, IsEmail, IsArray } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() tradeName?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() stateRegistration?: string;
  @IsOptional() @IsString() municipalRegistration?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  // campos fiscais
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() openingDate?: string; // aceita DD/MM/YYYY ou YYYY-MM-DD
  @IsOptional() @IsString() legalNature?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() mainActivity?: string;
  @IsOptional() @IsArray() secondaryActivities?: string[];
}
