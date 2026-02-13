import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
