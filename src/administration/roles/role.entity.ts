// E:\workspace\clientes\otj\api\src\roles\role.entity.ts
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../company/company.entity';
import { DepartmentRole } from '../departments/department-role.entity';
import { User } from '../users/user.entity';
import { RoleRule } from './role-rule.entity';

@Entity({ name: 'role' })
export class Role {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'name', type: 'text' })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Company, (c) => c.roles)
  @JoinColumn({ name: 'company_id', referencedColumnName: 'id' })
  company?: Company;

  @OneToMany(() => DepartmentRole, (dr) => dr.role)
  departments?: DepartmentRole[];

  @OneToMany(() => User, (u) => u.role)
  users?: User[];

  @OneToMany(() => RoleRule, (rr) => rr.role)
  rules?: RoleRule[];
}
