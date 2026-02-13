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
  Req,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { Authz } from '../../auth/decorators/rule.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TranscriptorMulterExceptionFilter } from '../../_common/filters/transcriptor-multer-exception.filter';
import { User } from '../../_common/decorators/user.decorator';
import { TranscriptionsService } from './transcriptions.service';
import { TranscriptionSharesService } from '../transcription-shares/transcription-shares.service';
import {
  ListTranscriptionsQueryDto,
  ExplorerQueryDto,
  SharedWithMeExplorerQueryDto,
  UpdateSegmentDto,
  BulkUpdateSegmentsDto,
  UpsertSpeakerLabelsDto,
  UpdateTranscriptionDto,
  UpsertTagsDto,
} from './dtos/transcriptions.dto';

@Controller('transcriptions')
@UseGuards(JwtAuthGuard)
export class TranscriptionsController {
  constructor(
    private service: TranscriptionsService,
    private transcriptionSharesService: TranscriptionSharesService,
  ) {}

  private getAuditMeta(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ??
        req.socket?.remoteAddress ??
        null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    };
  }

  // -------- Transcriptions ----------

  @Get()
  @Authz('transcriptions.read')
  async list(
    @User('userId') userId: string,
    @Query() q: ListTranscriptionsQueryDto,
  ) {
    return this.service.list(userId, q);
  }

  @Get('explorer')
  @Authz('transcriptions.read')
  async explorer(@User('userId') userId: string, @Query() q: ExplorerQueryDto) {
    return this.service.explorer(userId, q);
  }

  @Get('shared-with-me/users')
  @Authz('transcriptions.read')
  async listSharedWithMeUsers(@User('userId') userId: string) {
    return this.transcriptionSharesService.listUsersWhoSharedWithMe(userId);
  }

  @Get('shared-with-me/explorer')
  @Authz('transcriptions.read')
  async explorerSharedWithMe(
    @User('userId') userId: string,
    @Query() q: SharedWithMeExplorerQueryDto,
  ) {
    return this.service.explorerSharedWithMe(userId, q);
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
  @UseFilters(TranscriptorMulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 600 * 1024 * 1024 }, // 600MB para áudio
    }),
  )
  async create(
    @Req() req: Request,
    @Res() res: Response,
    @User('userId') userId: string,
    @Body('diarizationEnabled') diarizationEnabledRaw?: string,
    @Body('diarization_enabled') diarizationEnabledRaw2?: string,
    @Body('diarization') diarizationEnabledRaw3?: string,
    @Body('folderId') folderId?: string | null,
  ) {
    const meta = this.getAuditMeta(req);
    const anyReq = req as any;
    const file = anyReq.file;
    const diarizationEnabled =
      String(
        diarizationEnabledRaw ??
          diarizationEnabledRaw2 ??
          diarizationEnabledRaw3 ??
          'true',
      ) !== 'false';

    const created = await this.service.create(
      userId,
      file,
      diarizationEnabled,
      meta,
      folderId ?? undefined,
    );
    return res.json(created);
  }

  @Patch(':id')
  @Authz('transcriptions.update')
  async update(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTranscriptionDto,
  ) {
    return this.service.update(userId, id, dto, this.getAuditMeta(req));
  }

  @Delete(':id')
  @Authz('transcriptions.delete')
  async softDelete(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.softDelete(userId, id, this.getAuditMeta(req));
  }

  // -------- Editing (segments / speakers) ----------

  @Patch(':id/segments/:segmentId')
  @Authz('transcriptions.update')
  async updateSegment(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('segmentId') segmentId: string,
    @Body() dto: UpdateSegmentDto,
  ) {
    return this.service.updateSegment(
      userId,
      id,
      segmentId,
      dto,
      this.getAuditMeta(req),
    );
  }

  @Patch(':id/segments')
  @Authz('transcriptions.update')
  async bulkUpdateSegments(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BulkUpdateSegmentsDto,
  ) {
    return this.service.bulkUpdateSegments(
      userId,
      id,
      dto,
      this.getAuditMeta(req),
    );
  }

  @Get(':id/speakers')
  @Authz('transcriptions.read')
  async getSpeakerLabels(
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getSpeakerLabels(userId, id);
  }

  @Post(':id/speakers')
  @Authz('transcriptions.update')
  async upsertSpeakerLabels(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertSpeakerLabelsDto,
  ) {
    return this.service.upsertSpeakerLabels(
      userId,
      id,
      dto,
      this.getAuditMeta(req),
    );
  }

  // -------- Media ----------

  @Get(':id/media')
  @Authz('transcriptions.read')
  async media(
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getMediaMeta(userId, id);
  }

  @Get(':id/media/stream')
  @Authz('transcriptions.read')
  async mediaStream(
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('download') download?: string,
  ) {
    const range = req.headers['range'] as string | undefined;
    await this.service.streamMedia(userId, id, res, { download, range });
  }

  // -------- Tags ----------

  @Post(':id/tags')
  @Authz('transcriptions.create')
  async addTags(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertTagsDto,
  ) {
    return this.service.addTags(userId, id, dto, this.getAuditMeta(req));
  }

  @Delete(':id/tags/:tag')
  @Authz('transcriptions.delete')
  async removeTag(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('tag') tag: string,
  ) {
    return this.service.removeTag(userId, id, tag, this.getAuditMeta(req));
  }
}
