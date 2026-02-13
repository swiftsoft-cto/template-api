import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { Address } from './address.entity';
import { CompanyPersonLink } from './company-person-link.entity';

export enum AddressType {
  ALTERNATIVE = 'A',
  PERSONAL = 'P',
  COMMERCIAL = 'C',
  DELIVERY = 'E',
}

@Entity({ name: 'customer_company' })
export class CustomerCompany {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'legal_name', type: 'text' })
  legalName: string;

  @Column({ name: 'trade_name', type: 'text', nullable: true })
  tradeName: string | null;

  @Column({
    name: 'cnpj',
    type: 'char',
    length: 14,
    unique: true,
  })
  cnpj: string;

  @Column({ name: 'state_registration', type: 'text', nullable: true })
  stateRegistration: string | null;

  @Column({ name: 'municipal_registration', type: 'text', nullable: true })
  municipalRegistration: string | null;

  @Column({ name: 'email', type: 'text', nullable: true })
  email: string | null;

  @Column({ name: 'phone', type: 'text', nullable: true })
  phone: string | null;

  @Column({ name: 'status', type: 'text', nullable: true })
  status: string | null;

  @Column({ name: 'opening_date', type: 'timestamptz', nullable: true })
  openingDate: Date | null;

  @Column({ name: 'legal_nature', type: 'text', nullable: true })
  legalNature: string | null;

  @Column({ name: 'size', type: 'text', nullable: true })
  size: string | null;

  @Column({ name: 'main_activity', type: 'text', nullable: true })
  mainActivity: string | null;

  @Column({
    name: 'secondary_activities',
    type: 'text',
    array: true,
    nullable: true,
  })
  secondaryActivities: string[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToOne(() => Customer, (customer) => customer.company)
  @JoinColumn({ name: 'customer_id', referencedColumnName: 'id' })
  customer?: Customer;

  @OneToMany(() => Address, (address) => address.company)
  addresses?: Address[];

  @OneToMany(() => CompanyPersonLink, (link) => link.company)
  links?: CompanyPersonLink[];
}
