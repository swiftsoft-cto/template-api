import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { AuditModule } from '../../audit/audit.module';
import { StorageClientModule } from '../../_common/storage-client/storage-client.module';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { TranscriptionShareLink } from './entities/transcriptor-share.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';

@Module({
  imports: [
    RolesModule,
    AuditModule,
    StorageClientModule,
    TypeOrmModule.forFeature([TranscriptionShareLink, Transcriptor]),
  ],
  controllers: [ShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
