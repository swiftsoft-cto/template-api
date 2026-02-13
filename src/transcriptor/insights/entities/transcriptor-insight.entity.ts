import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type InsightStatus = 'queued' | 'running' | 'done' | 'error';

@Entity({ name: 'transcription_insight' })
export class TranscriptionInsight {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'transcription_id', type: 'uuid' })
  transcriptionId: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'type', type: 'text' })
  type: string;

  @Column({ name: 'status', type: 'text', default: 'queued' })
  status: InsightStatus;

  @Column({ name: 'result', type: 'jsonb', nullable: true })
  result: any | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
