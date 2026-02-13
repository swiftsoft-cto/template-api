import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Requisitos:
 * - Postgres
 * - extensão pgvector
 *
 * Dimensão do vector:
 * - default aqui: 1536 (text-embedding-3-small)
 * Ajuste se você mudar AI_EMBEDDING_MODEL.
 */
export class TranscriptionSegmentVector20260208170000
  implements MigrationInterface
{
  name = 'TranscriptionSegmentVector20260208170000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS transcription_segment_vector (
        id uuid PRIMARY KEY,
        transcription_id uuid NOT NULL,
        user_id uuid NOT NULL,
        segment_id text NOT NULL,
        segment_index int NOT NULL,
        embedding vector(1536),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT transcription_segment_vector_uq UNIQUE (transcription_id, user_id, segment_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS transcription_segment_vector_lookup_idx
      ON transcription_segment_vector (transcription_id, user_id, segment_index)
    `);

    // índice vetorial (cosine)
    // Obs: ivfflat recomenda ANALYZE após carga inicial; ajuste lists conforme volume.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS transcription_segment_vector_embedding_idx
      ON transcription_segment_vector
      USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS transcription_segment_vector_embedding_idx`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS transcription_segment_vector_lookup_idx`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS transcription_segment_vector`,
    );
    // não removemos a extensão por segurança (pode ser usada por outras features)
  }
}
