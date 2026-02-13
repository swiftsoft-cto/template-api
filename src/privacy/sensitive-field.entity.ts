import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'sensitive_field' })
@Index(['entity', 'companyId'])
export class SensitiveField {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'entity', type: 'text' })
  entity: string;

  @Column({ name: 'field', type: 'text' })
  field: string;

  @Column({ name: 'module_name', type: 'text', nullable: true })
  moduleName: string | null;

  @Column({ name: 'label', type: 'text', nullable: true })
  label: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'read_rule', type: 'text', nullable: true })
  readRule: string | null;

  @Column({ name: 'write_rule', type: 'text', nullable: true })
  writeRule: string | null;

  @Column({ name: 'active', type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
