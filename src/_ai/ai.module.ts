import { Module } from '@nestjs/common';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AiUsageModule } from './ai-usage.module';

@Module({
  imports: [AiUsageModule],
  providers: [AiOrchestratorService],
  exports: [AiOrchestratorService],
})
export class AiModule {}
