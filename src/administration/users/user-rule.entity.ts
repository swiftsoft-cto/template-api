import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Rule } from '../rules/rule.entity';

/**
 * Regras extras por usuário (additive) — ideal para "liberar feature por pagamento".
 * - Mantém histórico via revokedAt (em vez de deletar).
 * - Permite expiração (ex.: assinatura).
 */
@Entity({ name: 'user_rule' })
@Index(['userId', 'ruleId'], { unique: true })
export class UserRule {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  /** "manual" (admin) | "payment" (checkout/billing) */
  @Column({ name: 'source', type: 'text', default: 'manual' })
  source: 'manual' | 'payment';

  /** Se setado, a regra fica ativa até esta data */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** Se setado, a regra é considerada revogada */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, (u) => u.extraRules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user?: User;

  @ManyToOne(() => Rule, (r) => r.userRules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id', referencedColumnName: 'id' })
  rule?: Rule;
}
