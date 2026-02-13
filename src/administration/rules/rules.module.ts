import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { RolesModule } from '../roles/roles.module';
import { Rule } from './rule.entity';
import { RoleRule } from '../roles/role-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Rule, RoleRule]), RolesModule],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
