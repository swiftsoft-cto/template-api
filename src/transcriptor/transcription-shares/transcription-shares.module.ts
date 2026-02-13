import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { AuditModule } from '../../audit/audit.module';
import { TranscriptionSharesController } from './transcription-shares.controller';
import { TranscriptionSharesService } from './transcription-shares.service';
import { TranscriptionSharedWith } from './entities/transcription-shared-with.entity';
import { TranscriptionFolderSharedWith } from './entities/transcription-folder-shared-with.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionFolder } from '../transcription-folders/entities/transcription-folder.entity';
import { User } from '../../administration/users/user.entity';

@Module({
  imports: [
    RolesModule,
    AuditModule,
    TypeOrmModule.forFeature([
      TranscriptionSharedWith,
      TranscriptionFolderSharedWith,
      Transcriptor,
      TranscriptionFolder,
      User,
    ]),
  ],
  controllers: [TranscriptionSharesController],
  providers: [TranscriptionSharesService],
  exports: [TranscriptionSharesService],
})
export class TranscriptionSharesModule {}
