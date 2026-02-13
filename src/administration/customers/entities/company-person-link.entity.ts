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
import { CustomerCompany } from './customer-company.entity';
import { CustomerPerson } from './customer-person.entity';

@Entity({ name: 'company_person_link' })
export class CompanyPersonLink {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'role', type: 'text', nullable: true })
  role: string | null;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'is_legal_representative', type: 'boolean', default: false })
  isLegalRepresentative: boolean;

  @Column({ name: 'started_on', type: 'timestamptz', nullable: true })
  startedOn: Date | null;

  @Column({ name: 'ended_on', type: 'timestamptz', nullable: true })
  endedOn: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => CustomerCompany, (company) => company.links)
  @JoinColumn({ name: 'company_id', referencedColumnName: 'id' })
  company?: CustomerCompany;

  @ManyToOne(() => CustomerPerson, (person) => person.companyLinks)
  @JoinColumn({ name: 'person_id', referencedColumnName: 'id' })
  person?: CustomerPerson;
}
