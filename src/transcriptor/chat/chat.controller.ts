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
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dtos/chat.dto';

@Controller('transcriptions/:transcriptionId/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private service: ChatService) {}

  private getAuditMeta(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ??
        req.socket?.remoteAddress ??
        null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    };
  }

  @Get('threads')
  @Authz('transcriptions.chat.read')
  async listThreads(
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
  ) {
    return this.service.listThreads(userId, transcriptionId);
  }

  @Get('threads/:threadId/messages')
  @Authz('transcriptions.chat.read')
  async listMessages(
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Param('threadId', new ParseUUIDPipe()) threadId: string,
  ) {
    return this.service.listMessages(userId, transcriptionId, threadId);
  }

  @Post('messages')
  @Authz('transcriptions.chat.create')
  async chat(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Body() dto: ChatMessageDto,
  ) {
    return this.service.chat(
      userId,
      transcriptionId,
      dto,
      this.getAuditMeta(req),
    );
  }

  @Delete('threads/:threadId')
  @Authz('transcriptions.chat.delete')
  async deleteThread(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Param('threadId', new ParseUUIDPipe()) threadId: string,
  ) {
    return this.service.deleteThread(
      userId,
      transcriptionId,
      threadId,
      this.getAuditMeta(req),
    );
  }
}
