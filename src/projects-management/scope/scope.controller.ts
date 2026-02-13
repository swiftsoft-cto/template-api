import {
  Body,
  Controller,
  UsePipes,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProjectScopeService } from './scope.service';
import { ZodValidationPipe } from '../../_common/pipes/zod-validation.pipe';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';
import {
  CreateProjectScopeBody,
  UpdateProjectScopeBody,
  ListProjectScopeQuery,
} from './scope.schema';

@UsePipes(ZodValidationPipe)
@Controller('projects')
export class ProjectScopeController {
  constructor(private readonly svc: ProjectScopeService) {}

  @Authz('projects-management.scopes.read')
  @Get('scopes')
  async listAllScopes(@Query() params: ListProjectScopeQuery) {
    return this.svc.findAll(params);
  }

  @Authz('projects-management.scopes.create')
  @Post('scopes')
  async create(
    @Body() dto: CreateProjectScopeBody,
    @User('userId') userId: string,
    @User('name') userName?: string,
  ) {
    return this.svc.create(dto as any, userId, userName);
  }

  @Authz('projects-management.scopes.read')
  @Get('scopes/:id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.findOne(id);
  }

  @Authz('projects-management.scopes.update')
  @Patch('scopes/:id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProjectScopeBody,
    @User('userId') userId: string,
    @User('name') userName?: string,
  ) {
    return this.svc.update(id, dto as any, userId, userName);
  }

  @Authz('projects-management.scopes.delete')
  @Delete('scopes/:id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }
}
