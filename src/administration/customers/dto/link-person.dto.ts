import {
  IsOptional,
  IsString,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePersonNestedDto } from './create-customer.dto';

export class LinkPersonDto {
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
  @ValidateNested()
  @Type(() => CreatePersonNestedDto)
  createPerson?: CreatePersonNestedDto;
}
