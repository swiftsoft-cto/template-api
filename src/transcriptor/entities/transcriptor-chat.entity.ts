import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'transcription_chat_thread' })
export class TranscriptionChatThread {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'transcription_id', type: 'uuid' })
  transcriptionId: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'title', type: 'text', nullable: true })
  title: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

export type ChatRole = 'user' | 'assistant';

export type ChatCitation = {
  segmentId: string;
  startTime?: string;
  endTime?: string;
  snippet?: string;
};

@Entity({ name: 'transcription_chat_message' })
export class TranscriptionChatMessage {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @Column({ name: 'role', type: 'text' })
  role: ChatRole;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Column({ name: 'citations', type: 'jsonb', nullable: true })
  citations: ChatCitation[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
