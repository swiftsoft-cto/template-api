import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './notification.entity';
import { User } from '../administration/users/user.entity';
import { RolesModule } from '../administration/roles/roles.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User]), RolesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
