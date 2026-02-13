import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';
import { RolesModule } from '../roles/roles.module';
import { Department } from './department.entity';
import { DepartmentRole } from './department-role.entity';
import { User } from '../users/user.entity';
import { Company } from '../company/company.entity';
import { Role } from '../roles/role.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Department, DepartmentRole, User, Company, Role]),
    RolesModule,
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
