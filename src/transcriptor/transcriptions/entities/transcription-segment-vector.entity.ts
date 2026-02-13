import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tabela de embeddings por segmento (pgvector).
 * Obs: mantemos apenas o mínimo necessário para RAG eficiente.
 */
@Entity({ name: 'transcription_segment_vector' })
@Index(['transcriptionId', 'userId', 'segmentId'], { unique: true })
@Index(['transcriptionId', 'userId', 'segmentIndex'])
export class TranscriptionSegmentVector {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column('uuid', { name: 'transcription_id' })
  transcriptionId: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @Column({ name: 'segment_id', type: 'text' })
  segmentId: string;

  @Column({ name: 'segment_index', type: 'int' })
  segmentIndex: number;

  /**
   * pgvector. O TypeORM não tem tipo nativo "vector", mas ele repassa o type.
   * Inserção/consulta usa casts ::vector nas queries.
   */
  @Column({ name: 'embedding', type: 'vector' as any, nullable: true })
  embedding: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
