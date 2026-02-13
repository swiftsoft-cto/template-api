import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { AddressType } from '../entities';

export class CreateAddressDto {
  @IsEnum(AddressType)
  addressType: AddressType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsString()
  street: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  @IsString()
  postalCode: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
