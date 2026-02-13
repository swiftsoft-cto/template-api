import { Controller, Get, Query } from '@nestjs/common';
import { RulesService } from './rules.service';
import { RulesListDto } from './rules.schema';
import { Authz } from '../../auth/decorators/rule.decorator';

// Ex.: GET /rules?search=user&flat=false
@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Get()
  @Authz('rules.read')
  list(@Query() q: RulesListDto) {
    return this.rulesService.listAll(q);
  }
}
