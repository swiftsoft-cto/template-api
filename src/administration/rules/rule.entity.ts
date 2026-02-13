import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RoleRule } from '../roles/role-rule.entity';
import { UserRule } from '../users/user-rule.entity';

@Entity({ name: 'rule' })
export class Rule {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'name', type: 'text', unique: true })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => RoleRule, (roleRule) => roleRule.rule)
  roles?: RoleRule[];

  @OneToMany(() => UserRule, (ur) => ur.rule)
  userRules?: UserRule[];
}
