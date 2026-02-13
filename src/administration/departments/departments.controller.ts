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
import { DepartmentsService } from './departments.service';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
  DeptPaginationDto,
} from './departments.schema';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @Authz('departments.create')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateDepartmentDto,
    @User('userId') requesterId: string,
  ) {
    return this.departmentsService.create(body, requesterId);
  }

  @Get()
  @Authz('departments.read')
  findAll(
    @Query() query: DeptPaginationDto,
    @User('userId') requesterId: string,
  ) {
    return this.departmentsService.list(query, requesterId);
  }

  @Get(':id')
  @Authz('departments.read')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.departmentsService.findOne(id, requesterId);
  }

  @Patch(':id')
  @Authz('departments.update')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateDepartmentDto,
    @User('userId') requesterId: string,
  ) {
    return this.departmentsService.update(id, body, requesterId);
  }

  @Delete(':id')
  @Authz('departments.delete')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.departmentsService.remove(id, requesterId);
  }

  // Relacionamentos com roles
  @Post(':id/roles/:roleId')
  @Authz('departments.roles.create')
  addRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @User('userId') requesterId: string,
  ) {
    return this.departmentsService.addRole(id, roleId, requesterId);
  }

  @Delete(':id/roles/:roleId')
  @Authz('departments.roles.delete')
  removeRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @User('userId') requesterId: string,
  ) {
    return this.departmentsService.removeRole(id, roleId, requesterId);
  }

  @Get(':id/roles')
  @Authz('departments.roles.read')
  listRoles(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User('userId') requesterId: string,
  ) {
    return this.departmentsService.listRoles(id, requesterId);
  }
}
