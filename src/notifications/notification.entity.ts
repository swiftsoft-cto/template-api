import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../administration/users/user.entity';

@Entity({ name: 'notification' })
export class Notification {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'title', type: 'text' })
  title: string;

  @Column({ name: 'message', type: 'text' })
  message: string;

  @Index()
  @Column({ name: 'entity', type: 'text', nullable: true })
  entity: string | null;

  @Index()
  @Column({ name: 'register_id', type: 'uuid', nullable: true })
  registerId: string | null;

  @Column({ name: 'read', type: 'boolean', default: false })
  read: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user?: User;
}
