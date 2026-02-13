import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from '../auth.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { RefreshToken } from '../refresh-token.entity';

@Injectable()
export class TokenCleanupJob {
  private readonly logger = new Logger(TokenCleanupJob.name);

  constructor(
    private authService: AuthService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleTokenCleanup() {
    try {
      // Limpa tokens expirados
      const expiredCount = await this.authService.cleanupExpiredTokens();

      // Limpa tokens revogados antigos (mais de 30 dias)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const delRes = await this.refreshTokenRepo.delete({
        revoked: true,
        createdAt: LessThan(thirtyDaysAgo),
      } as any);
      const revokedCount = { count: delRes.affected ?? 0 };

      // Log separado para cada tipo de limpeza (útil para dashboards)
      if (expiredCount > 0) {
        this.logger.log(`Cleaned up ${expiredCount} expired refresh tokens`);
      }

      if (revokedCount.count > 0) {
        this.logger.log(
          `Cleaned up ${revokedCount.count} old revoked refresh tokens (older than 30 days)`,
        );
      }

      // Log consolidado apenas se houve limpeza
      if (expiredCount > 0 || revokedCount.count > 0) {
        this.logger.log(
          `Token cleanup completed: ${expiredCount} expired + ${revokedCount.count} old revoked = ${expiredCount + revokedCount.count} total`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to cleanup tokens', error.stack);
    }
  }
}
