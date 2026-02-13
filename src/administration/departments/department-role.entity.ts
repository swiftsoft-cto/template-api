// E:\workspace\clientes\otj\api\src\departments\department-role.entity.ts
import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Department } from './department.entity';
import { Role } from '../roles/role.entity';

@Entity({ name: 'department_role' })
export class DepartmentRole {
  @PrimaryColumn('uuid', { name: 'department_id' })
  departmentId: string;

  @PrimaryColumn('uuid', { name: 'role_id' })
  roleId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Department, (d) => d.roles, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'department_id', referencedColumnName: 'id' })
  department?: Department;

  @ManyToOne(() => Role, (r) => r.departments, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'role_id', referencedColumnName: 'id' })
  role?: Role;
}
