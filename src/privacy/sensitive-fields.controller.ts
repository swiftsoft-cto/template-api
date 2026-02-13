import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import { SensitiveFieldsService } from './sensitive-fields.service';
import { Authz } from '../auth/decorators/rule.decorator';
import {
  CreateSensitiveFieldDto,
  UpdateSensitiveFieldDto,
  SFPaginationDto,
  MapQuery,
} from './sensitive-fields.schema';
import { ZodValidationPipe } from '../_common/pipes/zod-validation.pipe';

@UsePipes(ZodValidationPipe)
@Controller('privacy/sensitive-fields')
export class SensitiveFieldsController {
  constructor(private svc: SensitiveFieldsService) {}

  @Post()
  @Authz('privacy.sensitive-fields.create')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateSensitiveFieldDto) {
    return this.svc.create(body);
  }

  // ---------- Mapas (coloque rotas fixas ANTES das dinâmicas) ----------
  @Get('effective-map')
  @Authz('privacy.sensitive-fields.read')
  async effectiveMap(@Query() q: MapQuery) {
    const data = await this.svc.getEffectiveMap(q.entity, q.companyId ?? null);
    return { data };
  }

  @Get('active-map')
  @Authz('privacy.sensitive-fields.read')
  async activeMap(@Query() q: MapQuery) {
    const data = await this.svc.getActiveMap(q.entity, q.companyId ?? null);
    return { data };
  }

  @Get(':id')
  @Authz('privacy.sensitive-fields.read')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Get()
  @Authz('privacy.sensitive-fields.read')
  list(@Query() q: SFPaginationDto) {
    return this.svc.list(q);
  }

  @Patch(':id')
  @Authz('privacy.sensitive-fields.update')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateSensitiveFieldDto,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @Authz('privacy.sensitive-fields.delete')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }
}
