import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Role } from './role.entity';
import { Rule } from '../rules/rule.entity';

@Entity({ name: 'role_rule' })
export class RoleRule {
  // A tabela original usa PK composta (role_id, rule_id)
  @PrimaryColumn('uuid', { name: 'role_id' })
  roleId: string;

  @PrimaryColumn('uuid', { name: 'rule_id' })
  ruleId: string;

  @ManyToOne(() => Role, (role) => role.rules)
  @JoinColumn({ name: 'role_id', referencedColumnName: 'id' })
  role?: Role;

  @ManyToOne(() => Rule, (rule) => rule.roles)
  @JoinColumn({ name: 'rule_id', referencedColumnName: 'id' })
  rule?: Rule;
}
