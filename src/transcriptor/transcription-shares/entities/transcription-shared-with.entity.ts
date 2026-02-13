import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'transcription_shared_with' })
@Index(['transcriptionId', 'sharedWithUserId'], { unique: true })
export class TranscriptionSharedWith {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'transcription_id', type: 'uuid' })
  transcriptionId: string;

  @Index()
  @Column({ name: 'shared_with_user_id', type: 'uuid' })
  sharedWithUserId: string;

  @Index()
  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
