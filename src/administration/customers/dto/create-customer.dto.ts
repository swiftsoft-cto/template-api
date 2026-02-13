import {
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsDateString,
  IsEmail,
  IsBoolean,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerKind } from '../entities';
import { CreateAddressDto } from './address.dto';

export class CreatePersonNestedDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsString()
  @Matches(/^\d{11}$/, { message: 'cpf deve conter 11 dígitos' })
  cpf: string;

  @IsOptional()
  @IsString()
  rg?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @ValidateIf((o) => o.email && o.email.trim() !== '')
  @IsEmail({}, { message: 'Email deve ter um formato válido' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAddressDto)
  addresses?: CreateAddressDto[];
}

export class CompanyPersonRefDto {
  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isLegalRepresentative?: boolean;

  @IsOptional()
  @IsDateString()
  startedOn?: string;

  @IsOptional()
  @IsDateString()
  endedOn?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePersonNestedDto)
  createPerson?: CreatePersonNestedDto;
}

export class CreateCompanyNestedDto {
  @IsString()
  legalName: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsString()
  cnpj: string;

  @IsOptional()
  @IsString()
  stateRegistration?: string;

  @IsOptional()
  @IsString()
  municipalRegistration?: string;

  @IsOptional()
  @ValidateIf((o) => o.email && o.email.trim() !== '')
  @IsEmail({}, { message: 'Email deve ter um formato válido' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // ------ NOVOS CAMPOS OPCIONAIS ------
  @IsOptional()
  @IsString()
  status?: string; // ex.: 'ACTIVE'

  @IsOptional()
  @IsString()
  openingDate?: string; // esperado 'dd/MM/yyyy'

  @IsOptional()
  @IsString()
  legalNature?: string;

  @IsOptional()
  @IsString()
  size?: string; // ex.: 'MICRO EMPRESA'

  @IsOptional()
  @IsString()
  mainActivity?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secondaryActivities?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAddressDto)
  addresses?: CreateAddressDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyPersonRefDto)
  people?: CompanyPersonRefDto[];
}

export class CreateCustomerDto {
  @IsEnum(CustomerKind)
  kind: CustomerKind;

  @IsString() // será normalizado/fallback no service se vier vazio
  displayName: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePersonNestedDto)
  person?: CreatePersonNestedDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCompanyNestedDto)
  company?: CreateCompanyNestedDto;
}
