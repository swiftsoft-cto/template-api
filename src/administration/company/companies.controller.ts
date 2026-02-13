import { Controller, Get, Patch, Body } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';
import { UpdateCompanyDto } from './companies.schema';

@Controller('company')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  // Retorna a empresa padrão (da instância / do requester)
  @Get()
  @Authz('company.read')
  getMine(@User('userId') requesterId: string) {
    return this.companies.getMyCompany(requesterId);
  }

  // Atualiza os campos básicos da empresa
  @Patch()
  @Authz('company.update')
  updateMine(
    @Body() body: UpdateCompanyDto,
    @User('userId') requesterId: string,
  ) {
    return this.companies.updateMyCompany(requesterId, body);
  }
}
