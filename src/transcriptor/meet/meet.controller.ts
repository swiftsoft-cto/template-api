import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Authz } from '../../auth/decorators/rule.decorator';
import { User } from '../../_common/decorators/user.decorator';
import { FetchMeetDto } from './dtos/fetch-meet.dto';
import { MeetService } from './meet.service';

@Controller('transcriptions/meet')
@UseGuards(JwtAuthGuard)
export class MeetController {
  constructor(private readonly meet: MeetService) {}

  @Post('fetch')
  @Authz('transcriptions.read')
  async fetch(@User('userId') userId: string, @Body() dto: FetchMeetDto) {
    return this.meet.fetchMeetPage(userId, dto.url, {
      clickSelector: dto.clickSelector ?? undefined,
      headless: dto.headless,
      keepOpen: dto.keepOpen,
    });
  }
}
