import { IsUUID } from 'class-validator';

export class ShareTranscriptionWithUserDto {
  @IsUUID()
  userId: string;
}

export class ShareFolderWithUserDto {
  @IsUUID()
  userId: string;
}
