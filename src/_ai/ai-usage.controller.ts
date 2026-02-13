import { Controller, Get, Query } from '@nestjs/common';
import { Authz } from '../auth/decorators/rule.decorator';
import { AiUsageService } from './ai-usage.service';
import { ListAiUsageQueryDto, SummaryAiUsageQueryDto } from './ai-usage.schema';

@Controller('ai/usage')
export class AiUsageController {
  constructor(private readonly usage: AiUsageService) {}

  @Get()
  @Authz('ai.usage.read')
  findAll(@Query() dto: ListAiUsageQueryDto) {
    return this.usage.findAll(dto as any);
  }

  @Get('summary')
  @Authz('ai.usage.read')
  summary(@Query() dto: SummaryAiUsageQueryDto) {
    return this.usage.summary(dto as any);
  }
}
