import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Authz } from '../../auth/decorators/rule.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../_common/decorators/user.decorator';
import { TranscriptionSharesService } from './transcription-shares.service';
import {
  ShareTranscriptionWithUserDto,
  ShareFolderWithUserDto,
} from './dtos/transcription-shares.dto';

/**
 * Endpoints para compartilhar transcrições e pastas com usuários específicos.
 * Regra separada: transcription_shares.*
 */
@Controller('transcription-shares')
@UseGuards(JwtAuthGuard)
export class TranscriptionSharesController {
  constructor(private service: TranscriptionSharesService) {}

  private getAuditMeta(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ??
        req.socket?.remoteAddress ??
        null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    };
  }

  @Post('transcriptions/:transcriptionId/share')
  @Authz('transcription_shares.create')
  async share(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Body() dto: ShareTranscriptionWithUserDto,
  ) {
    return this.service.share(
      userId,
      transcriptionId,
      dto,
      this.getAuditMeta(req),
    );
  }

  @Delete('transcriptions/:transcriptionId/share/:sharedWithUserId')
  @Authz('transcription_shares.delete')
  async unshare(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Param('sharedWithUserId', new ParseUUIDPipe()) sharedWithUserId: string,
  ) {
    return this.service.unshare(
      userId,
      transcriptionId,
      sharedWithUserId,
      this.getAuditMeta(req),
    );
  }

  @Get('transcriptions/:transcriptionId/shared-with')
  @Authz('transcription_shares.read')
  async listSharedWith(
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
  ) {
    return this.service.listSharedWith(userId, transcriptionId);
  }

  // -------- Compartilhamento de pasta --------

  @Post('folders/:folderId/share')
  @Authz('transcription_shares.create')
  async shareFolder(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
    @Body() dto: ShareFolderWithUserDto,
  ) {
    return this.service.shareFolder(
      userId,
      folderId,
      dto,
      this.getAuditMeta(req),
    );
  }

  @Delete('folders/:folderId/share/:sharedWithUserId')
  @Authz('transcription_shares.delete')
  async unshareFolder(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
    @Param('sharedWithUserId', new ParseUUIDPipe()) sharedWithUserId: string,
  ) {
    return this.service.unshareFolder(
      userId,
      folderId,
      sharedWithUserId,
      this.getAuditMeta(req),
    );
  }

  @Get('folders/:folderId/shared-with')
  @Authz('transcription_shares.read')
  async listFolderSharedWith(
    @User('userId') userId: string,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
  ) {
    return this.service.listFolderSharedWith(userId, folderId);
  }
}
