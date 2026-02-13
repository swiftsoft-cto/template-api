import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Authz } from '../../auth/decorators/rule.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../_common/decorators/user.decorator';
import { TranscriptionFoldersService } from './transcription-folders.service';
import {
  CreateTranscriptionFolderDto,
  UpdateTranscriptionFolderDto,
  ListTranscriptionFoldersQueryDto,
  ResolvePathQueryDto,
} from './dtos/transcription-folders.dto';

@Controller('transcription-folders')
@UseGuards(JwtAuthGuard)
export class TranscriptionFoldersController {
  constructor(private service: TranscriptionFoldersService) {}

  @Get()
  @Authz('transcriptions.read')
  async list(
    @User('userId') userId: string,
    @Query() q: ListTranscriptionFoldersQueryDto,
  ) {
    return this.service.list(userId, q.parentId ?? undefined);
  }

  @Get('resolve')
  @Authz('transcriptions.read')
  async resolveByPath(
    @User('userId') userId: string,
    @Query() q: ResolvePathQueryDto,
  ) {
    return this.service.resolveByPath(userId, q.path);
  }

  @Get(':id')
  @Authz('transcriptions.read')
  async get(
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.get(userId, id);
  }

  @Post()
  @Authz('transcriptions.create')
  async create(
    @User('userId') userId: string,
    @Body() dto: CreateTranscriptionFolderDto,
  ) {
    return this.service.create(userId, dto);
  }

  @Patch(':id')
  @Authz('transcriptions.update')
  async update(
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTranscriptionFolderDto,
  ) {
    return this.service.update(userId, id, dto);
  }

  @Delete(':id')
  @Authz('transcriptions.delete')
  async softDelete(
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.softDelete(userId, id);
  }
}
