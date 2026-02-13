import {
  Body,
  Controller,
  UsePipes,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ZodValidationPipe } from '../../_common/pipes/zod-validation.pipe';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';
import { ListProjectsDto } from './dto/list-projects.dto.js';
import { CreateProjectBody, UpdateProjectBody } from './http-bodies';
import { CreateProjectDto, UpdateProjectDto } from './projects.schema';

// Regex para UUID v4 - garante que :id só case com UUIDs válidos
// Isso evita que rotas como /projects/scopes sejam capturadas por /projects/:id
const UUID_V4_REGEX =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';

@UsePipes(ZodValidationPipe) // aplica Zod+i18n quando o parâmetro tiver static schema
@Controller('projects')
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  // ---------- Listar todos os projetos com paginação ----------
  @Authz('projects.read')
  @Get()
  async listAllProjects(@Query() params: ListProjectsDto) {
    return this.svc.findAll(params);
  }

  // ---------- Criar projeto ----------
  @Authz('projects.create')
  @Post()
  create(@Body() dto: CreateProjectBody, @User('userId') userId: string) {
    // dto já está validado e traduzido pelo ZodValidationPipe
    return this.svc.create(dto as unknown as CreateProjectDto, userId);
  }

  // ---------- Buscar projeto por ID ----------
  @Authz('projects.read')
  @Get(`:id(${UUID_V4_REGEX})`)
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.findOne(id);
  }

  // ---------- Atualizar projeto ----------
  @Authz('projects.update')
  @Patch(`:id(${UUID_V4_REGEX})`)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProjectBody,
  ) {
    // dto já está validado e traduzido pelo ZodValidationPipe
    return this.svc.update(id, dto as unknown as UpdateProjectDto);
  }

  // ---------- Deletar projeto ----------
  @Authz('projects.delete')
  @Delete(`:id(${UUID_V4_REGEX})`)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }
}
