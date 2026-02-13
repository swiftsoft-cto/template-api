import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../../administration/roles/roles.module';
import { AuditModule } from '../../audit/audit.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { TranscriptionComment } from './entities/transcriptor-comment.entity';
import { Transcriptor } from '../transcriptions/entities/transcriptor.entity';
import { User } from '../../administration/users/user.entity';
import { TranscriptionSharesModule } from '../transcription-shares/transcription-shares.module';

@Module({
  imports: [
    RolesModule,
    AuditModule,
    TranscriptionSharesModule,
    TypeOrmModule.forFeature([TranscriptionComment, Transcriptor, User]),
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
