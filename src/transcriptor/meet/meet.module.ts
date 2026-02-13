import { Module, forwardRef } from '@nestjs/common';
import { RolesModule } from '../../administration/roles/roles.module';
import { TranscriptionsModule } from '../transcriptions/transcriptions.module';
import { MeetController } from './meet.controller';
import { MeetService } from './meet.service';

@Module({
  imports: [RolesModule, forwardRef(() => TranscriptionsModule)],
  controllers: [MeetController],
  providers: [MeetService],
  exports: [MeetService],
})
export class MeetModule {}
