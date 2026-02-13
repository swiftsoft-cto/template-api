import { Global, Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { RealtimeGateway } from './realtime.gateway';

@Global()
@Module({
  providers: [RealtimeService, RealtimeGateway],
  exports: [RealtimeService],
})
export class RealtimeModule {}
