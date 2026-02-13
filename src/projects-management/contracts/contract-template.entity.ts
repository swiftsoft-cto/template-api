import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../projects/project.entity';
import { User } from '../../administration/users/user.entity';

@Entity({ name: 'contract_template' })
@Index('ux_contract_template_project_name', ['projectId', 'name'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
export class ContractTemplate {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'name', type: 'varchar', length: 200 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'template_html', type: 'text' })
  templateHtml: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'project_id', referencedColumnName: 'id' })
  project?: Project;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user?: User;
}
