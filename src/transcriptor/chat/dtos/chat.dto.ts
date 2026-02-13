import { IsOptional, IsString } from 'class-validator';

export class ChatMessageDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  threadId?: string;
}
