import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../administration/users/user.entity';

@Entity('account_block_log')
export class AccountBlockLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  @Index()
  action!: 'block' | 'unblock' | 'expire';

  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  emailHash!: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  until!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor?: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;
}
