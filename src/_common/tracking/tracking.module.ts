import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackingService } from './tracking.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { User } from '../../administration/users/user.entity';

@Module({
  imports: [WhatsAppModule, TypeOrmModule.forFeature([User])],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
