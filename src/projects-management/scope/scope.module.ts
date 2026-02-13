import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectScopeController } from './scope.controller';
import { ProjectScopeService } from './scope.service';
import { ProjectScope } from './scope.entity';
import { Project } from '../projects/project.entity';
import { User } from '../../administration/users/user.entity';
import { Rule } from '../../administration/rules/rule.entity';
import { RoleRule } from '../../administration/roles/role-rule.entity';
import { AiModule } from '../../_ai/ai.module';
import { RolesModule } from '../../administration/roles/roles.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { TrackingModule } from '../../_common/tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectScope, Project, User, Rule, RoleRule]),
    AiModule,
    RolesModule,
    NotificationsModule,
    TrackingModule,
  ],
  controllers: [ProjectScopeController],
  providers: [ProjectScopeService],
  exports: [ProjectScopeService],
})
export class ScopeModule {}
