import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Authz } from '../../auth/decorators/rule.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { User } from '../../_common/decorators/user.decorator';
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto } from './dtos/comments.dto';

@Controller('transcriptions/:transcriptionId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private service: CommentsService) {}

  private getAuditMeta(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ??
        req.socket?.remoteAddress ??
        null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    };
  }

  @Get()
  @Authz('transcriptions.comments.read')
  async list(
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
  ) {
    return this.service.list(userId, transcriptionId);
  }

  @Post()
  @Authz('transcriptions.comments.create')
  async create(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.service.create(
      userId,
      transcriptionId,
      dto,
      this.getAuditMeta(req),
    );
  }

  @Patch(':commentId')
  @Authz('transcriptions.comments.update')
  async update(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.service.update(
      userId,
      transcriptionId,
      commentId,
      dto,
      this.getAuditMeta(req),
    );
  }

  @Delete(':commentId')
  @Authz('transcriptions.comments.delete')
  async delete(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
  ) {
    return this.service.delete(
      userId,
      transcriptionId,
      commentId,
      this.getAuditMeta(req),
    );
  }
}
