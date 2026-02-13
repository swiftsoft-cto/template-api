// E:\workspace\clientes\otj\api\src\departments\department.entity.ts
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
import { DepartmentRole } from './department-role.entity';
import { User } from '../users/user.entity';

@Entity({ name: 'department' })
export class Department {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'name', type: 'text' })
  name: string;

  // responsável pela assinatura do departamento
  @Column({ name: 'signature_user_id', type: 'uuid', nullable: true })
  signatureUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'signature_user_id', referencedColumnName: 'id' })
  signatureUser?: User | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Company, (c) => c.departments)
  @JoinColumn({ name: 'company_id', referencedColumnName: 'id' })
  company?: Company;

  @OneToMany(() => DepartmentRole, (dr) => dr.department)
  roles?: DepartmentRole[];
}
