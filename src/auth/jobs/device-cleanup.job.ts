import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { TrustedDevice } from '../trusted-device.entity';

@Injectable()
export class DeviceCleanupJob {
  private readonly logger = new Logger(DeviceCleanupJob.name);

  constructor(
    @InjectRepository(TrustedDevice)
    private readonly trustedDeviceRepo: Repository<TrustedDevice>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldDevices() {
    try {
      // Remove dispositivos não usados há mais de 90 dias
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const result = await this.trustedDeviceRepo.update(
        { lastSeen: LessThan(cutoffDate), deletedAt: IsNull() } as any,
        { deletedAt: new Date() } as any,
      );

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Soft-deleted ${result.affected} old trusted devices (not used since ${cutoffDate.toISOString()})`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old devices', error);
    }
  }
}
