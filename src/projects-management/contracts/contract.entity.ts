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
import { Customer } from '../../administration/customers/entities/customer.entity';
import { User } from '../../administration/users/user.entity';
import { ContractTemplate } from './contract-template.entity';
import { ProjectScope } from '../scope/scope.entity';

export type ContractStatus = 'draft' | 'final' | 'signed' | 'canceled';

@Entity({ name: 'contract' })
export class Contract {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'draft' })
  status: ContractStatus;

  @Column({ name: 'is_locked', type: 'boolean', default: false })
  isLocked: boolean;

  @Column({
    name: 'autentique_document_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  autentiqueDocumentId: string | null;

  // snapshots para auditoria (template/scope podem mudar depois)
  @Column({ name: 'template_html_snapshot', type: 'text' })
  templateHtmlSnapshot: string;

  @Column({ name: 'scope_html_snapshot', type: 'text', nullable: true })
  scopeHtmlSnapshot: string | null;

  // HTML final renderizado (ou manualmente editado)
  @Column({ name: 'contract_html', type: 'text' })
  contractHtml: string;

  @Column({ name: 'variables_json', type: 'jsonb', nullable: true })
  variablesJson: Record<string, string> | null;

  @Column({ name: 'unresolved_placeholders', type: 'jsonb', nullable: true })
  unresolvedPlaceholders: string[] | null;

  @Column({
    name: 'monthly_value',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  monthlyValue: number | null;

  @Column({ name: 'months_count', type: 'int', nullable: true })
  monthsCount: number | null;

  @Column({ name: 'first_payment_day', type: 'int', nullable: true })
  firstPaymentDay: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'project_id', referencedColumnName: 'id' })
  project?: Project | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'id' })
  customer?: Customer | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user?: User | null;

  @ManyToOne(() => ContractTemplate, { nullable: false })
  @JoinColumn({ name: 'template_id', referencedColumnName: 'id' })
  template?: ContractTemplate;

  @ManyToOne(() => ProjectScope, { nullable: true })
  @JoinColumn({ name: 'scope_id', referencedColumnName: 'id' })
  scope?: ProjectScope | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by', referencedColumnName: 'id' })
  createdByUser?: User | null;
}
