import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { AddressType } from '../entities';

export class UpdateAddressDto {
  @IsOptional()
  @IsEnum(AddressType)
  addressType?: AddressType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
