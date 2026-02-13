import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { RedisModule } from '../../_common/redis/redis.module';
import { RolesModule } from '../roles/roles.module';
import { SensitiveFieldsModule } from '../../privacy/sensitive-fields.module';
import { AccountBlockModule } from '../../auth/account-block.module';
import { StorageClientModule } from '../../_common/storage-client/storage-client.module';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';
import { Department } from '../departments/department.entity';
import { DepartmentRole } from '../departments/department-role.entity';
import { RefreshToken } from '../../auth/refresh-token.entity';
import { AccountBlock } from '../../auth/account-block.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Department,
      DepartmentRole,
      RefreshToken,
      AccountBlock,
    ]),
    RedisModule,
    RolesModule,
    SensitiveFieldsModule,
    AccountBlockModule,
    StorageClientModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
