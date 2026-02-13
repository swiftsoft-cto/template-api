import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerPerson } from './customer-person.entity';
import { CustomerCompany } from './customer-company.entity';
import { CustomerBranch } from './customer-branch.entity';

export enum CustomerKind {
  PERSON = 'PERSON',
  COMPANY = 'COMPANY',
}

@Entity({ name: 'customer' })
export class Customer {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({
    name: 'kind',
    type: 'enum',
    enum: CustomerKind,
  })
  kind: CustomerKind;

  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToOne(() => CustomerPerson, (person) => person.customer, {
    cascade: true,
  })
  person?: CustomerPerson;

  @OneToOne(() => CustomerCompany, (company) => company.customer, {
    cascade: true,
  })
  company?: CustomerCompany;

  @OneToMany(() => CustomerBranch, (branch) => branch.parent)
  branches?: CustomerBranch[];

  @OneToMany(() => CustomerBranch, (branch) => branch.child)
  parentBranches?: CustomerBranch[];
}
