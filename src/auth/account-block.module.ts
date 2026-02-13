import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountBlockService } from './account-block.service';
import { RedisModule } from '../_common/redis/redis.module';
import { BlockCleanupJob } from './jobs/block-cleanup.job';
import { AccountBlock } from './account-block.entity';
import { AccountBlockLog } from './account-block-log.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AccountBlock, AccountBlockLog]),
    RedisModule,
    ScheduleModule.forRoot(),
  ],
  providers: [AccountBlockService, BlockCleanupJob],
  exports: [AccountBlockService],
})
export class AccountBlockModule {}
