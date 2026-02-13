import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerPerson } from './customer-person.entity';
import { CustomerCompany } from './customer-company.entity';
import { AddressType } from './customer-company.entity';

@Entity({ name: 'address' })
export class Address {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({
    name: 'address_type',
    type: 'enum',
    enum: AddressType,
  })
  addressType: AddressType;

  @Column({ name: 'label', type: 'text', nullable: true })
  label: string | null;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'street', type: 'text' })
  street: string;

  @Column({ name: 'number', type: 'text', nullable: true })
  number: string | null;

  @Column({ name: 'complement', type: 'text', nullable: true })
  complement: string | null;

  @Column({ name: 'district', type: 'text', nullable: true })
  district: string | null;

  @Column({ name: 'city', type: 'text' })
  city: string;

  @Column({ name: 'state', type: 'text' })
  state: string;

  @Column({ name: 'postal_code', type: 'text' })
  postalCode: string;

  @Column({ name: 'country', type: 'text', default: 'Brasil' })
  country: string;

  @Column({ name: 'reference', type: 'text', nullable: true })
  reference: string | null;

  @Column({ name: 'person_id', type: 'uuid', nullable: true })
  personId: string | null;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => CustomerPerson, (person) => person.addresses, {
    nullable: true,
  })
  @JoinColumn({ name: 'person_id', referencedColumnName: 'id' })
  person?: CustomerPerson | null;

  @ManyToOne(() => CustomerCompany, (company) => company.addresses, {
    nullable: true,
  })
  @JoinColumn({ name: 'company_id', referencedColumnName: 'id' })
  company?: CustomerCompany | null;
}
