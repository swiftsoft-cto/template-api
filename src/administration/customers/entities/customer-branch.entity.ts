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
import { Customer } from './customer.entity';

@Entity({ name: 'customer_branch' })
export class CustomerBranch {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'parent_id', type: 'uuid' })
  parentId: string;

  @Column({ name: 'child_id', type: 'uuid' })
  childId: string;

  @Column({ name: 'note', type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'since', type: 'timestamptz', nullable: true })
  since: Date | null;

  @Column({ name: 'until', type: 'timestamptz', nullable: true })
  until: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Customer, (customer) => customer.branches)
  @JoinColumn({ name: 'parent_id', referencedColumnName: 'id' })
  parent?: Customer;

  @ManyToOne(() => Customer, (customer) => customer.parentBranches)
  @JoinColumn({ name: 'child_id', referencedColumnName: 'id' })
  child?: Customer;
}
