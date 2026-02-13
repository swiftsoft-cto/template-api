import {
  Body,
  Controller,
  UsePipes,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { ZodValidationPipe } from '../../_common/pipes/zod-validation.pipe';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';
import { CreateCustomerBody, CreateBranchBody } from './http-bodies';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateAddressDto } from './dto/address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { LinkPersonDto } from './dto/link-person.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ListCustomersDto } from './dto/list-customers.dto';

@UsePipes(ZodValidationPipe) // aplica Zod+i18n quando o parâmetro tiver static schema
@Controller('customers')
export class CustomersController {
  constructor(private readonly svc: CustomersService) {}

  // ---------- Coleções por tipo (colocar ANTES das rotas dinâmicas) ----------
  @Authz('customers.read')
  @Get('companies')
  listCompanies(@Query('q') q?: string, @Query('search') search?: string) {
    return this.svc.listByKind('COMPANY', q ?? search);
  }

  @Authz('customers.read')
  @Get('people')
  listPeople(@Query('q') q?: string, @Query('search') search?: string) {
    return this.svc.listByKind('PERSON', q ?? search);
  }

  // ---------- Consulta CNPJ na Receita Federal ----------
  @Authz('customers.read')
  @Get('cnpj/:cnpj')
  async consultCnpj(@Param('cnpj') cnpj: string) {
    return this.svc.consultCnpj(cnpj);
  }

  @Authz('customers.read')
  @Get('receita-federal/:cnpj')
  async consultCnpjReceitaFederal(@Param('cnpj') cnpj: string) {
    return this.svc.consultCnpj(cnpj);
  }

  // ---------- Listar todos os clientes com paginação ----------
  @Authz('customers.read')
  @Get()
  async listAllCustomers(@Query() params: ListCustomersDto) {
    return this.svc.listAllCustomers(params);
  }

  // ---------- Customers ----------
  @Authz('customers.create')
  @Post()
  create(@Body() dto: CreateCustomerBody, @User('userId') userId: string) {
    // dto já está validado e traduzido pelo ZodValidationPipe
    return this.svc.createCustomer(dto as unknown as CreateCustomerDto, userId);
  }

  @Authz('customers.read')
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('tree', new ParseBoolPipe({ optional: true })) tree?: boolean,
  ) {
    return this.svc.getCustomer(id, { tree: !!tree });
  }

  @Authz('customers.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.svc.updateCustomer(id, dto);
  }

  // ---------- Atualização de dados da empresa ----------
  @Authz('customers.company.update')
  @Patch(':customerId/company')
  updateCompany(
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.svc.updateCompanyForCustomer(customerId, dto);
  }

  @Authz('customers.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.deleteCustomer(id);
  }

  // ---------- Addresses (sempre aninhado em customers) ----------
  @Authz('customers.addresses.read')
  @Get(':customerId/addresses')
  listAddresses(@Param('customerId') customerId: string) {
    return this.svc.listAddresses(customerId);
  }

  @Authz('customers.addresses.create')
  @Post(':customerId/addresses')
  addAddress(
    @Param('customerId') customerId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.svc.addAddressForCustomer(customerId, dto);
  }

  @Authz('customers.addresses.update')
  @Patch(':customerId/addresses/:addressId')
  updateAddress(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.svc.updateAddressForCustomer(customerId, addressId, dto);
  }

  @Authz('customers.addresses.delete')
  @Delete(':customerId/addresses/:addressId')
  deleteAddress(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.svc.deleteAddressForCustomer(customerId, addressId);
  }

  // ---------- Company ↔ People (sempre aninhado em customers/:id) ----------
  @Authz('customers.people.read')
  @Get(':customerId/people')
  listCompanyPeople(@Param('customerId') customerId: string) {
    return this.svc.listCompanyPeople(customerId);
  }

  @Authz('customers.people.create')
  @Post(':customerId/people')
  linkPerson(
    @Param('customerId') customerId: string,
    @Body() dto: LinkPersonDto,
  ) {
    return this.svc.linkPersonToCompanyByCustomerId(customerId, dto);
  }

  @Authz('customers.people.delete')
  @Delete(':customerId/people/:personId')
  unlinkPerson(
    @Param('customerId') customerId: string,
    @Param('personId') personId: string,
  ) {
    return this.svc.unlinkPersonFromCompany(customerId, personId);
  }

  // ---------- Branches (filiais) ----------
  @Authz('customers.branches.read')
  @Get(':customerId/branches')
  listBranches(@Param('customerId') customerId: string) {
    return this.svc.listBranches(customerId);
  }

  @Authz('customers.branches.create')
  @Post(':customerId/branches')
  createBranch(
    @Param('customerId') customerId: string,
    @Body() dto: CreateBranchBody,
  ) {
    return this.svc.createBranchByCustomerId(customerId, dto as any);
  }

  // Alias: vincular filial existente (atalho para o front que envia POST com :childId)
  @Authz('customers.branches.create')
  @Post(':customerId/branches/:childId')
  linkExistingBranch(
    @Param('customerId') customerId: string,
    @Param('childId') childId: string,
  ) {
    // reaproveita a lógica já existente no service
    return this.svc.createBranchByCustomerId(customerId, {
      existingCustomerId: childId,
    });
  }

  @Authz('customers.branches.delete')
  @Delete(':customerId/branches/:childId')
  removeBranch(
    @Param('customerId') customerId: string,
    @Param('childId') childId: string,
  ) {
    return this.svc.removeBranch(customerId, childId);
  }
}
