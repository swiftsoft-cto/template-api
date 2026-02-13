import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { RedisModule } from '../../_common/redis/redis.module';
import { Role } from './role.entity';
import { User } from '../users/user.entity';
import { Company } from '../company/company.entity';
import { Rule } from '../rules/rule.entity';
import { UserRule } from '../users/user-rule.entity';
import { RoleRule } from './role-rule.entity';
import { DepartmentRole } from '../departments/department-role.entity';
import { Department } from '../departments/department.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Role,
      User,
      Company,
      Rule,
      UserRule,
      RoleRule,
      DepartmentRole,
      Department,
    ]),
    RedisModule,
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
