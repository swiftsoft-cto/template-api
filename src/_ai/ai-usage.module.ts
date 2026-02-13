import { Module } from '@nestjs/common';
import { AiUsageController } from './ai-usage.controller';
import { AiUsageService } from './ai-usage.service';
import { RolesModule } from '../administration/roles/roles.module';

@Module({
  imports: [RolesModule],
  controllers: [AiUsageController],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
