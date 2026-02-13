import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import {
  CreateRoleDto,
  UpdateRoleDto,
  RolePaginationDto,
} from './roles.schema';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @Authz('roles.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateRoleDto, @User('userId') requesterId: string) {
    return this.rolesService.create(body, requesterId);
  }

  @Get()
  @Authz('roles.read')
  findAll(
    @Query() query: RolePaginationDto,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.list(query, requesterId);
  }

  @Get(':id')
  @Authz('roles.read')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.findOne(id, requesterId);
  }

  @Patch(':id')
  @Authz('roles.update')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateRoleDto,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.update(id, body, requesterId);
  }

  @Delete(':id')
  @Authz('roles.delete')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.remove(id, requesterId);
  }

  // Relacionamentos com usuários
  @Get(':id/users')
  @Authz('roles.users.read')
  listUsers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.listUsers(id, requesterId);
  }

  // Relacionamentos com rules
  @Get(':id/rules')
  @Authz('roles.rules.read')
  listRoleRules(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.listRoleRules(id, requesterId);
  }

  @Post(':id/rules/:ruleId')
  @Authz('roles.rules.create')
  addRuleToRole(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.addRuleToRole(roleId, ruleId, requesterId);
  }

  @Delete(':id/rules/:ruleId')
  @Authz('roles.rules.delete')
  removeRuleFromRole(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.removeRuleFromRole(roleId, ruleId, requesterId);
  }

  // --- Departments <-> Roles ---
  @Get(':id/departments')
  @Authz('roles.departments.read')
  listDepartments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.listDepartments(id, requesterId);
  }

  // (opcional) vincular via /roles
  @Post(':id/departments/:departmentId')
  @Authz('roles.departments.create')
  addDepartment(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Param('departmentId', new ParseUUIDPipe()) departmentId: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.addDepartment(roleId, departmentId, requesterId);
  }

  // (opcional) desvincular via /roles
  @Delete(':id/departments/:departmentId')
  @Authz('roles.departments.delete')
  removeDepartment(
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Param('departmentId', new ParseUUIDPipe()) departmentId: string,
    @User('userId') requesterId: string,
  ) {
    return this.rolesService.removeDepartment(
      roleId,
      departmentId,
      requesterId,
    );
  }
}
