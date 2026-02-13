import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { CustomersModule } from '../../administration/customers/customers.module';
import { Customer } from '../../administration/customers/entities/customer.entity';
import { User } from '../../administration/users/user.entity';
import { Project } from '../projects/project.entity';
import { ProjectScope } from '../scope/scope.entity';
import { Contract } from './contract.entity';
import { ContractTemplate } from './contract-template.entity';
import { Rule } from '../../administration/rules/rule.entity';
import { RoleRule } from '../../administration/roles/role-rule.entity';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { TrackingModule } from '../../_common/tracking/tracking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContractTemplate,
      Contract,
      Project,
      Customer,
      ProjectScope,
      User,
      Rule,
      RoleRule,
    ]),
    RolesModule,
    CustomersModule,
    NotificationsModule,
    TrackingModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
