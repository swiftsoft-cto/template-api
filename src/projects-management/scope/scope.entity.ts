import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../projects/project.entity';
import { User } from '../../administration/users/user.entity';

export type ProjectScopeStatus = 'created' | 'in_review' | 'finalized';

@Entity({ name: 'project_scope' })
export class ProjectScope {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'name', type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'brief_text', type: 'text' })
  briefText: string;

  @Column({ name: 'scope_html', type: 'text' })
  scopeHtml: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'created',
  })
  status: ProjectScopeStatus;

  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Project, { nullable: false })
  @JoinColumn({ name: 'project_id', referencedColumnName: 'id' })
  project?: Project;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user?: User;
}
