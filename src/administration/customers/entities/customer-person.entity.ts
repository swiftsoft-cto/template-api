import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { Address } from './address.entity';
import { CompanyPersonLink } from './company-person-link.entity';

@Entity({ name: 'customer_person' })
export class CustomerPerson {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'full_name', type: 'text' })
  fullName: string;

  @Column({
    name: 'cpf',
    type: 'char',
    length: 11,
    unique: true,
  })
  cpf: string;

  @Column({ name: 'rg', type: 'text', nullable: true })
  rg: string | null;

  @Column({ name: 'birth_date', type: 'timestamptz', nullable: true })
  birthDate: Date | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email: string | null;

  @Column({ name: 'phone', type: 'text', nullable: true })
  phone: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToOne(() => Customer, (customer) => customer.person)
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'id' })
  customer?: Customer;

  @OneToMany(() => Address, (address) => address.person)
  addresses?: Address[];

  @OneToMany(() => CompanyPersonLink, (link) => link.person)
  companyLinks?: CompanyPersonLink[];
}
