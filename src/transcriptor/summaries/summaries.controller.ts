import {
  Body,
  Controller,
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
import { SummariesService } from './summaries.service';
import { GenerateSummaryDto } from './dtos/summaries.dto';

@Controller('transcriptions/:transcriptionId')
@UseGuards(JwtAuthGuard)
export class SummariesController {
  constructor(private service: SummariesService) {}

  private getAuditMeta(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ??
        req.socket?.remoteAddress ??
        null,
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    };
  }

  @Get('summaries')
  @Authz('transcriptions.summaries.read')
  async list(
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
  ) {
    return this.service.list(userId, transcriptionId);
  }

  @Post('summary')
  @Authz('transcriptions.summaries.create')
  async generate(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Body() dto: GenerateSummaryDto,
  ) {
    return this.service.generate(
      userId,
      transcriptionId,
      dto,
      this.getAuditMeta(req),
    );
  }
}
