// E:\workspace\clientes\otj\api\src\users\user.entity.ts
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../company/company.entity';
import { Role } from '../roles/role.entity';
import { UserRule } from './user-rule.entity';
import { RefreshToken } from '../../auth/refresh-token.entity';

@Entity({ name: 'user' })
export class User {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'cpf', type: 'char', length: 11, nullable: true })
  cpf: string | null;

  @Column({ name: 'cnpj', type: 'char', length: 14, nullable: true })
  cnpj: string | null;

  @Column({ name: 'birth_date', type: 'timestamptz', nullable: true })
  birthdate: Date | null;

  @Column({ name: 'name', type: 'text' })
  name: string;

  @Index({ unique: true })
  @Column({ name: 'email', type: 'text', unique: true })
  email: string;

  @Column({ name: 'password', type: 'text' })
  password: string;

  @Column({ name: 'phone', type: 'text', nullable: true })
  phone: string | null;

  @Column({ name: 'postal_code', type: 'text', nullable: true })
  postalCode: string | null;

  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'address_state', type: 'text', nullable: true })
  addressState: string | null;

  @Column({ name: 'address_city', type: 'text', nullable: true })
  addressCity: string | null;

  @Column({ name: 'address_neighborhood', type: 'text', nullable: true })
  addressNeighborhood: string | null;

  @Column({ name: 'service', type: 'text', nullable: true })
  service: string | null;

  @Column({ name: 'avatar_file_id', type: 'text', nullable: true })
  avatarFileId: string | null;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  @ManyToOne(() => Company, (c) => c.users, { nullable: true })
  @JoinColumn({ name: 'company_id', referencedColumnName: 'id' })
  company?: Company | null;

  @ManyToOne(() => Role, (r) => r.users, { nullable: true })
  @JoinColumn({ name: 'role_id', referencedColumnName: 'id' })
  role?: Role | null;

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  tokens?: RefreshToken[];

  @OneToMany(() => UserRule, (ur) => ur.user)
  extraRules?: UserRule[];
}
