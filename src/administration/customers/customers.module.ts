import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { RolesModule } from '../roles/roles.module';
import * as CustomerEntities from './entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerEntities.Customer,
      CustomerEntities.CustomerPerson,
      CustomerEntities.CustomerCompany,
      CustomerEntities.Address,
      CustomerEntities.CustomerBranch,
      CustomerEntities.CompanyPersonLink,
    ]),
    HttpModule,
    RolesModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
