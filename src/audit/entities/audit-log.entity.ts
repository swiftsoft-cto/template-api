import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

@Entity({ name: 'audit_log' })
export class AuditLog {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Index()
  @Column({ name: 'entity', type: 'text' })
  entity: string;

  @Index()
  @Column({ name: 'entity_id', type: 'text' })
  entityId: string;

  @Column({ name: 'action', type: 'text' })
  action: AuditAction;

  @Column({ name: 'before', type: 'jsonb', nullable: true })
  before: any | null;

  @Column({ name: 'after', type: 'jsonb', nullable: true })
  after: any | null;

  @Column({ name: 'ip', type: 'text', nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
