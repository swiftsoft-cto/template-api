import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SensitiveFieldsService } from './sensitive-fields.service';
import { SensitiveFieldsController } from './sensitive-fields.controller';
import { SensitiveField } from './sensitive-field.entity';
import { RedisModule } from '../_common/redis/redis.module';
import { RolesModule } from '../administration/roles/roles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SensitiveField]),
    RedisModule,
    RolesModule,
  ],
  controllers: [SensitiveFieldsController],
  providers: [SensitiveFieldsService],
  exports: [SensitiveFieldsService],
})
export class SensitiveFieldsModule {}
