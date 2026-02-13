import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { AuditModule } from '../../audit/audit.module';
import { AiModule } from '../../_ai/ai.module';
import { IceBreakersController } from './icebreakers.controller';
import { IceBreakersService } from './icebreakers.service';
import { TranscriptionIceBreaker } from './entities/transcriptor-ice-breaker.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionSharesModule } from '../transcription-shares/transcription-shares.module';

@Module({
  imports: [
    RolesModule,
    AuditModule,
    AiModule,
    TranscriptionSharesModule,
    TypeOrmModule.forFeature([TranscriptionIceBreaker, Transcriptor]),
  ],
  controllers: [IceBreakersController],
  providers: [IceBreakersService],
  exports: [IceBreakersService], // Exporta para ser usado em outros módulos
})
export class IceBreakersModule {}
