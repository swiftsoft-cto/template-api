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
import { InsightsService } from './insights.service';
import { CreateInsightsDto } from './dtos/insights.dto';

@Controller('transcriptions/:transcriptionId/insights')
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private service: InsightsService) {}

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
  @Authz('transcriptions.read')
  async get(
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
  ) {
    return this.service.get(userId, transcriptionId);
  }

  @Post()
  @Authz('transcriptions.create')
  async create(
    @Req() req: Request,
    @User('userId') userId: string,
    @Param('transcriptionId', new ParseUUIDPipe()) transcriptionId: string,
    @Body() dto: CreateInsightsDto,
  ) {
    return this.service.create(
      userId,
      transcriptionId,
      dto,
      this.getAuditMeta(req),
    );
  }
}
