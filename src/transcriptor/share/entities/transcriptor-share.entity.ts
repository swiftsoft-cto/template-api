import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type SharePermission = 'read' | 'comment';

@Entity({ name: 'transcription_share_link' })
export class TranscriptionShareLink {
  @PrimaryColumn('uuid', { name: 'token' })
  token: string;

  @Index()
  @Column({ name: 'transcription_id', type: 'uuid' })
  transcriptionId: string;

  @Index()
  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ name: 'permission', type: 'text', default: 'read' })
  permission: SharePermission;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
