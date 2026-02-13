import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateCustomerDto } from './create-customer.dto';

export class CreateBranchDto {
  // Vincula uma filial já existente
  @IsOptional()
  @IsString()
  existingCustomerId?: string;

  // OU cria um novo Customer como filial
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerDto)
  createCustomer?: CreateCustomerDto;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  since?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  until?: string; // YYYY-MM-DD
}
