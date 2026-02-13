import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TranscriptionFolder } from '../../transcription-folders/entities/transcription-folder.entity';

export type TranscriptionStatus = 'processing' | 'done' | 'error';

export type TranscriptionSegment = {
  id: string;
  startTime: string; // "00:00:00"
  endTime?: string;
  speaker?: string; // "Speaker 1"
  text: string;
};

@Entity({ name: 'transcription' })
export class Transcriptor {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'folder_id', type: 'uuid', nullable: true })
  folderId: string | null;

  @ManyToOne(() => TranscriptionFolder, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'folder_id' })
  folder: TranscriptionFolder | null;

  @Column({ name: 'title', type: 'text' })
  title: string;

  @Column({ name: 'source_file_name', type: 'text' })
  sourceFileName: string;

  @Column({ name: 'storage_file_id', type: 'text', nullable: true })
  storageFileId: string | null;

  @Column({ name: 'diarization_enabled', type: 'boolean', default: true })
  diarizationEnabled: boolean;

  @Column({ name: 'duration_seconds', type: 'int', default: 0 })
  durationSeconds: number;

  @Column({ name: 'status', type: 'text', default: 'processing' })
  status: TranscriptionStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({
    name: 'segments',
    type: 'jsonb',
    nullable: false,
    default: () => "'[]'::jsonb",
  })
  segments: TranscriptionSegment[];

  /**
   * Mapa de labels para falantes (diarização).
   * Ex: { "A": "Reclamante", "B": "Reclamada" }
   * Render: speakerLabels[seg.speaker] ?? seg.speaker
   */
  @Column({
    name: 'speaker_labels',
    type: 'jsonb',
    nullable: false,
    default: () => "'{}'::jsonb",
  })
  speakerLabels: Record<string, string>;

  @Column({
    name: 'tags',
    type: 'text',
    array: true,
    nullable: false,
    default: () => "'{}'",
  })
  tags: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
