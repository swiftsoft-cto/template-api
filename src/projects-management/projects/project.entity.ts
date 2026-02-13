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
import { Customer } from '../../administration/customers/entities/customer.entity';

export enum ProjectType {
  SOFTWARE = 'SOFTWARE',
  MAINTENANCE = 'MAINTENANCE',
  EVOLUTION = 'EVOLUTION',
  RESEARCH_DEVELOPMENT = 'RESEARCH_DEVELOPMENT',
  CONSULTING = 'CONSULTING',
  AGENTS_AI = 'AGENTS_AI',
  OTHER = 'OTHER',
}

@Entity({ name: 'project' })
export class Project {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'project_name', type: 'text' })
  projectName: string;

  @Column({ name: 'project_code', type: 'text', unique: true })
  projectCode: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'project_type',
    type: 'enum',
    enum: ProjectType,
    default: ProjectType.SOFTWARE,
  })
  projectType: ProjectType;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'has_signed_contract', type: 'boolean', default: false })
  hasSignedContract: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'id' })
  customer?: Customer;
}
