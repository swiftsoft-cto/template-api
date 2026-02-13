import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Authz } from '../../auth/decorators/rule.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../_common/decorators/user.decorator';
import { ShareService } from './share.service';
import { CreateShareLinkDto } from './dtos/share.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ShareController {
  constructor(private service: ShareService) {}

  private getAuditMeta(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ??
        req.socket?.remoteAddress ??
        null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    };
  }

  // -------- Gerenciamento de Share Links (protegido) ----------

  @Post('transcriptions/:transcriptionId/share-links')
  @Authz('transcriptions.create')
  async createShareLink(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.service.createShareLink(
      userId,
      transcriptionId,
      dto,
      this.getAuditMeta(req),
    );
  }

  @Delete('transcriptions/:transcriptionId/share-links/:token')
  @Authz('transcriptions.delete')
  async revokeShareLink(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Param('token', new ParseUUIDPipe()) token: string,
  ) {
    return this.service.revokeShareLink(
      userId,
      transcriptionId,
      token,
      this.getAuditMeta(req),
    );
  }

  // -------- Acesso Público via Token ----------

  @Get('share/:token')
  @Authz('transcriptions.read')
  async getShared(@Param('token', new ParseUUIDPipe()) token: string) {
    return this.service.getSharedTranscription(token);
  }

  @Get('share/:token/media/stream')
  @Authz('transcriptions.read')
  async streamSharedMedia(
    @Param('token', new ParseUUIDPipe()) token: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('download') download?: string,
  ) {
    const range = req.headers['range'] as string | undefined;
    await this.service.streamSharedMedia(token, res, { download, range });
  }
}
