import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'transcription_folder' })
export class TranscriptionFolder {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'name', type: 'text' })
  name: string;

  @ManyToOne(() => TranscriptionFolder, (f) => f.children, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent: TranscriptionFolder | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @OneToMany(() => TranscriptionFolder, (f) => f.parent)
  children: TranscriptionFolder[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
