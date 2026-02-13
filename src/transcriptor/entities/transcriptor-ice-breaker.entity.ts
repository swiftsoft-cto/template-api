import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'transcription_ice_breaker' })
export class TranscriptionIceBreaker {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'transcription_id', type: 'uuid' })
  transcriptionId: string;

  @Column({ name: 'question', type: 'text' })
  question: string;

  @Column({ name: 'order', type: 'int', default: 0 })
  order: number;

  @Column({ name: 'status', type: 'text', default: 'active' })
  status: 'active' | 'hidden';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
