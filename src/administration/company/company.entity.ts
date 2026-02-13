// E:\workspace\clientes\otj\api\src\org\company\company.entity.ts
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
import { Department } from '../departments/department.entity';
import { Role } from '../roles/role.entity';
import { User } from '../users/user.entity';

@Entity({ name: 'company' })
export class Company {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'name', type: 'text' })
  name: string;

  @Column({ name: 'trade_name', type: 'text', nullable: true })
  tradeName: string | null;

  @Column({
    name: 'cnpj',
    type: 'varchar',
    length: 14,
    nullable: true,
    unique: true,
  })
  cnpj: string | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email: string | null;

  @Column({ name: 'phone', type: 'text', nullable: true })
  phone: string | null;

  @Column({ name: 'website', type: 'text', nullable: true })
  website: string | null;

  // responsável pela assinatura da empresa
  @Column({ name: 'signature_user_id', type: 'uuid', nullable: true })
  signatureUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'signature_user_id', referencedColumnName: 'id' })
  signatureUser?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => Department, (d) => d.company)
  departments?: Department[];

  @OneToMany(() => Role, (r) => r.company)
  roles?: Role[];

  @OneToMany(() => User, (u) => u.company)
  users?: User[];
}
