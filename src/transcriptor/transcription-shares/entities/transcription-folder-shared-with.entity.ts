import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'transcription_folder_shared_with' })
@Index(['folderId', 'sharedWithUserId'], { unique: true })
export class TranscriptionFolderSharedWith {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'folder_id', type: 'uuid' })
  folderId: string;

  @Index()
  @Column({ name: 'shared_with_user_id', type: 'uuid' })
  sharedWithUserId: string;

  @Index()
  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
