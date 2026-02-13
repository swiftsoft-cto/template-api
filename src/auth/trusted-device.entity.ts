import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../administration/users/user.entity';

@Entity('trusted_device')
@Index(['userId', 'deviceHash'], { unique: true })
@Index(['userId', 'deletedAt'])
export class TrustedDevice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'device_hash', type: 'text' })
  deviceHash!: string;

  @Column({ name: 'ip_subnet', type: 'text' })
  ipSubnet!: string;

  @Column({ name: 'user_agent', type: 'text' })
  userAgent!: string;

  @Column({ name: 'device_name', type: 'text', nullable: true })
  deviceName!: string | null;

  @Column({ name: 'last_seen', type: 'timestamptz', nullable: true })
  lastSeen!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
