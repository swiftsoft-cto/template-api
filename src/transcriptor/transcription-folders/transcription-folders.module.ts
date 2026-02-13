import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { TranscriptionFolder } from './entities/transcription-folder.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { TranscriptionFoldersController } from './transcription-folders.controller';
import { TranscriptionFoldersService } from './transcription-folders.service';

@Module({
  imports: [
    RolesModule,
    TypeOrmModule.forFeature([TranscriptionFolder, Transcriptor]),
  ],
  controllers: [TranscriptionFoldersController],
  providers: [TranscriptionFoldersService],
  exports: [TranscriptionFoldersService],
})
export class TranscriptionFoldersModule {}
