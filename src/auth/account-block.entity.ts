// E:\workspace\clientes\otj\api\src\auth\account-block.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../administration/users/user.entity';

@Entity({ name: 'account_block' })
@Index(['status', 'until'])
@Index(['emailHash'])
@Index(['userId'])
export class AccountBlock {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email: string | null;

  @Column({ name: 'email_hash', type: 'text', nullable: true })
  emailHash: string | null;

  @Column({ name: 'reason', type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'blocked_by_id', type: 'uuid', nullable: true })
  blockedById: string | null;

  @CreateDateColumn({ name: 'blocked_at', type: 'timestamptz' })
  blockedAt: Date;

  @Column({ name: 'until', type: 'timestamptz', nullable: true })
  until: Date | null;

  @Column({ name: 'status', type: 'text', default: 'active' })
  status: string;

  @Column({ name: 'unblocked_at', type: 'timestamptz', nullable: true })
  unblockedAt: Date | null;

  @Column({ name: 'unblocked_by_id', type: 'uuid', nullable: true })
  unblockedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'blocked_by_id', referencedColumnName: 'id' })
  blockedBy?: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user?: User | null;
}
