import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountBlockService } from '../account-block.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AccountBlock } from '../account-block.entity';
import { AccountBlockLog } from '../account-block-log.entity';

@Injectable()
export class BlockCleanupJob {
  private readonly logger = new Logger(BlockCleanupJob.name);
  constructor(
    @InjectRepository(AccountBlock)
    private readonly accountBlockRepo: Repository<AccountBlock>,
    @InjectRepository(AccountBlockLog)
    private readonly accountBlockLogRepo: Repository<AccountBlockLog>,
    private blocks: AccountBlockService,
  ) {}

  // roda a cada 10 minutos
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireBlocks() {
    try {
      const now = new Date();
      // pega ids que estão "active" e venceram
      const rows = await this.accountBlockRepo.find({
        where: { status: 'active', until: LessThan(now) } as any,
        select: { id: true, userId: true, email: true } as any,
      });
      if (!rows.length) return;

      // marca como expired + audita
      for (const r of rows) {
        await this.accountBlockRepo.update(
          { id: r.id } as any,
          { status: 'expired', unblockedAt: now } as any,
        );
        await this.accountBlockLogRepo.save(
          this.accountBlockLogRepo.create({
            action: 'expire',
            userId: r.userId,
            email: r.email,
            emailHash: null,
          } as any),
        );
      }
      this.logger.log(`Expired ${rows.length} account blocks`);
    } catch (e) {
      this.logger.error('Failed to expire account blocks', e);
    }
  }
}
