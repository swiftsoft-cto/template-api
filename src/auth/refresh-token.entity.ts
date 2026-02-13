// E:\workspace\clientes\otj\api\src\auth\refresh-token.entity.ts
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

@Entity({ name: 'refresh_token' })
@Index(['userId', 'revoked'])
@Index(['expiresAt'])
@Index(['replacedById'])
@Index(['deviceHash'])
export class RefreshToken {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash: string;

  @Column({ name: 'device_hash', type: 'text' })
  deviceHash: string;

  @Column({ name: 'revoked', type: 'boolean', default: false })
  revoked: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById: string | null;

  @ManyToOne(() => User, (u) => u.tokens)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user?: User;
}
