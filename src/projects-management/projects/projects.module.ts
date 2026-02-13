import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from './project.entity';
import { Customer } from '../../administration/customers/entities/customer.entity';
import { User } from '../../administration/users/user.entity';
import { Rule } from '../../administration/rules/rule.entity';
import { RoleRule } from '../../administration/roles/role-rule.entity';
import { RolesModule } from '../../administration/roles/roles.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { TrackingModule } from '../../_common/tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Customer, User, Rule, RoleRule]),
    RolesModule,
    NotificationsModule,
    TrackingModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
