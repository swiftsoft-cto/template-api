import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fetch, FormData } from 'undici';
import { File } from 'node:buffer';
import { StorageClientService } from '../../_common/storage-client/storage-client.service';
import { RealtimeService } from '../../_common/realtime/realtime.service';
import { AuditService, AuditMeta } from '../../audit/audit.service';
import { AiOrchestratorService } from '../../_ai/ai-orchestrator.service';
import { AiUsageService } from '../../_ai/ai-usage.service';
import { IceBreakersService } from '../icebreakers/icebreakers.service';
import { TranscriptionSharesService } from '../transcription-shares/transcription-shares.service';
import {
  Transcriptor,
  TranscriptionSegment,
} from './entities/transcriptor.entity';
import { TranscriptionSegmentVector } from './entities/transcription-segment-vector.entity';
import {
  ListTranscriptionsQueryDto,
  UpdateSegmentDto,
  BulkUpdateSegmentsDto,
  UpsertSpeakerLabelsDto,
  UpdateTranscriptionDto,
  UpsertTagsDto,
  ExplorerQueryDto,
  SharedWithMeExplorerQueryDto,
} from './dtos/transcriptions.dto';
import { TranscriptionFoldersService } from '../transcription-folders/transcription-folders.service';
import { compressMediaForTranscription } from './compress-media.util';

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}

/** Limite da API OpenAI para transcrição: 25 MB por requisição. */
const OPENAI_TRANSCRIPTION_MAX_BYTES = 24 * 1024 * 1024;

/** Mínimo de bytes para ativar compressão (5 MB). */
const COMPRESS_MIN_BYTES = 5 * 1024 * 1024;

/** Duração alvo de cada chunk (segundos). Com 64 kbps mono ≈ 4.8 MB a cada 10 min. */
const CHUNK_DURATION_SECONDS = 600; // 10 min seguro

/** Timeout por chunk na API OpenAI (ms). */
const OPENAI_TRANSCRIBE_TIMEOUT_MS = 15 * 60_000; // 15 min

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err: unknown): boolean {
  const msg = String(
    err && typeof err === 'object' && 'message' in err
      ? (err as Error).message
      : err,
  );
  return (
    msg.includes('fetch failed') ||
    msg.includes('AbortError') ||
    msg.includes('429')
  );
}

async function retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (attempt > retries || !isRetryable(e)) throw e;
      const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
}

/** Executa tasks em paralelo com limite de concorrência. */
async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, tasks.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/** Converte segundos em string "HH:MM:SS" para segmentos. */
function secondsToHms(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => n.toString().padStart(2, '0')).join(':');
}

/** Converte "HH:MM:SS" em segundos. */
function hmsToSeconds(hms: string): number {
  const parts = hms.trim().split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

/**
 * Extrai duração em segundos do buffer de áudio (MP3, M4A, WAV, etc.).
 * Retorna 0 se falhar ou formato não suportado.
 */
async function getAudioDurationSeconds(
  buffer: Buffer,
  mimeType?: string,
): Promise<number> {
  try {
    const { parseBuffer } = await import('music-metadata');
    const metadata = await parseBuffer(
      new Uint8Array(buffer),
      mimeType ? { mimeType } : undefined,
      { duration: true },
    );
    const sec = metadata.format?.duration;
    if (typeof sec === 'number' && sec >= 0 && isFinite(sec)) {
      return Math.round(sec);
    }
  } catch {
    // Formato não suportado ou erro de parse: ignora e retorna 0
  }
  return 0;
}

@Injectable()
export class TranscriptionsService {
  private readonly logger = new Logger(TranscriptionsService.name);

  constructor(
    @InjectRepository(Transcriptor)
    private transcriptionsRepo: Repository<Transcriptor>,
    @InjectRepository(TranscriptionSegmentVector)
    private segmentVectorsRepo: Repository<TranscriptionSegmentVector>,
    private storage: StorageClientService,
    private audit: AuditService,
    private config: ConfigService,
    private aiUsage: AiUsageService,
    private aiOrchestrator: AiOrchestratorService,
    @Inject(forwardRef(() => IceBreakersService))
    private iceBreakersService: IceBreakersService,
    private transcriptionSharesService: TranscriptionSharesService,
    private realtime: RealtimeService,
    private transcriptionFoldersService: TranscriptionFoldersService,
  ) {}

  private toPgVectorString(v: number[]): string {
    const arr = Array.isArray(v) ? v : [];
    return `[${arr.map((n) => Number(n).toString()).join(',')}]`;
  }

  /**
   * Indexa embeddings para segmentos (upsert).
   * - usado após transcrição finalizar
   * - usado após edição de texto de segmentos (update/bulkUpdate)
   */
  private async upsertSegmentEmbeddings(args: {
    userId: string;
    transcriptionId: string;
    segments: Array<{ id: string; text: string }>;
    /** mapeia id->index (ordem atual do array) */
    indexById: Map<string, number>;
  }): Promise<void> {
    const { userId, transcriptionId, segments, indexById } = args;
    if (!segments?.length) return;

    const concurrency = Math.min(
      Number(
        this.config.get('AI_EMBEDDING_CONCURRENCY') ??
          process.env.AI_EMBEDDING_CONCURRENCY ??
          4,
      ),
      16,
    );

    const tasks = segments.map((seg) => async () => {
      const text = String(seg.text ?? '').trim();
      if (!text) return null;

      const emb = await this.aiOrchestrator.generateEmbedding(text, {
        userId,
        callName: 'transcription.segment.embedding',
      });
      const vec = this.toPgVectorString(emb);
      const segmentIndex = indexById.get(String(seg.id)) ?? 0;

      // Upsert por (transcription_id, user_id, segment_id)
      // embedding é feito com cast ::vector
      await this.segmentVectorsRepo.query(
        `
        INSERT INTO transcription_segment_vector (
          id, transcription_id, user_id, segment_id, segment_index, embedding, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6::vector, now(), now()
        )
        ON CONFLICT (transcription_id, user_id, segment_id)
        DO UPDATE SET
          segment_index = EXCLUDED.segment_index,
          embedding = EXCLUDED.embedding,
          updated_at = now()
        `,
        [
          crypto.randomUUID(),
          transcriptionId,
          userId,
          String(seg.id),
          Number(segmentIndex),
          vec,
        ],
      );

      return true;
    });

    // roda em pool (limita concorrência)
    const results = await runPool(tasks, concurrency);
    const ok = results.filter(Boolean).length;
    this.logger.log(
      `[Embeddings] indexados/upsertados ${ok}/${segments.length} segmentos para transcrição ${transcriptionId}`,
    );
  }

  private async indexAllSegmentsEmbeddings(userId: string, t: Transcriptor) {
    const segments = Array.isArray(t.segments) ? t.segments : [];
    if (!segments.length) return;
    const indexById = new Map<string, number>();
    for (let i = 0; i < segments.length; i++) {
      indexById.set(String(segments[i].id), i);
    }
    await this.upsertSegmentEmbeddings({
      userId,
      transcriptionId: t.id,
      segments: segments.map((s) => ({
        id: String(s.id),
        text: String(s.text ?? ''),
      })),
      indexById,
    });
  }

  // ---------- Mappers ----------

  toDto(t: Transcriptor, path?: string[]) {
    const pathString = path && path.length > 0 ? path.join('\\') : undefined;
    const createdAt =
      t.createdAt ?? (t as unknown as Record<string, unknown>).created_at;
    const createdAtIso =
      createdAt == null
        ? ''
        : createdAt instanceof Date
          ? createdAt.toISOString()
          : new Date(createdAt as string | number).toISOString();
    return {
      id: t.id,
      title: t.title,
      sourceFileName: t.sourceFileName,
      folderId: t.folderId ?? null,
      path: path ?? undefined,
      pathString: pathString ?? (t.folderId ? undefined : null),
      createdAt: createdAtIso,
      durationSeconds: t.durationSeconds,
      durationFormatted: formatDuration(t.durationSeconds),
      segments: t.segments ?? [],
      tags: t.tags ?? [],
      speakerLabels: t.speakerLabels ?? {},
      diarizationEnabled: t.diarizationEnabled,
      status: t.status,
      errorMessage: t.errorMessage ?? null,
    };
  }

  // ---------- Helpers ----------

  /**
   * Emite evento WebSocket para o usuário quando transcrição termina.
   * Usado para notificação em tempo real (quando user tem múltiplas transcrições na fila).
   */
  private emitTranscriptionStatus(
    userId: string,
    transcriptionId: string,
    status: 'done' | 'error',
    opts?: { title?: string; errorMessage?: string },
  ) {
    try {
      this.realtime.emitToUser(userId, 'transcription:status', {
        id: transcriptionId,
        status,
        title: opts?.title ?? null,
        errorMessage: opts?.errorMessage ?? null,
        at: new Date().toISOString(),
      });
    } catch {
      // Não falha o fluxo se emit der erro
    }
  }

  /** Apenas o dono pode usar. Para operações de escrita (update, delete, etc). */
  async requireOwnedTranscription(userId: string, id: string) {
    const t = await this.transcriptionsRepo.findOne({
      where: { id, userId, deletedAt: IsNull() },
    });
    if (!t) throw new NotFoundException('Transcrição não encontrada');
    return t;
  }

  /** Dono ou usuário com compartilhamento pode usar. Para operações de leitura (get, media). */
  async requireTranscriptionAccess(userId: string, id: string) {
    const t = await this.transcriptionSharesService.hasAccess(userId, id);
    if (!t) throw new NotFoundException('Transcrição não encontrada');
    return t;
  }

  // ---------- Editing (segments / speakers) ----------

  private ensureEditable(t: Transcriptor) {
    if (t.status !== 'done') {
      throw new BadRequestException(
        'Transcrição ainda não finalizada para edição. Aguarde status=done.',
      );
    }
  }

  async updateSegment(
    userId: string,
    transcriptionId: string,
    segmentId: string,
    dto: UpdateSegmentDto,
    meta?: AuditMeta,
  ) {
    const t = await this.requireOwnedTranscription(userId, transcriptionId);
    this.ensureEditable(t);

    const segments = Array.isArray(t.segments)
      ? t.segments.map((s) => ({ ...s }))
      : [];
    const idx = segments.findIndex((s) => String(s.id) === String(segmentId));
    if (idx < 0) throw new NotFoundException('Segmento não encontrado');

    const before = { ...segments[idx] };
    if (dto.text !== undefined) segments[idx].text = dto.text.trim();
    if (dto.speaker !== undefined) {
      const sp = dto.speaker.trim();
      if (sp.length === 0) delete (segments[idx] as any).speaker;
      else segments[idx].speaker = sp;
    }
    const textChanged =
      dto.text !== undefined &&
      String(before.text ?? '').trim() !==
        String(segments[idx].text ?? '').trim();

    await this.transcriptionsRepo.update({ id: transcriptionId }, {
      segments,
      updatedAt: new Date() as any,
    } as any);

    const updated = await this.requireOwnedTranscription(
      userId,
      transcriptionId,
    );

    // ✅ reindex só se mudou texto
    if (textChanged) {
      void this.upsertSegmentEmbeddings({
        userId,
        transcriptionId,
        segments: [
          {
            id: String(segments[idx].id),
            text: String(segments[idx].text ?? ''),
          },
        ],
        indexById: new Map([[String(segments[idx].id), idx]]),
      }).catch((e) =>
        this.logger.error(
          `[Embeddings] updateSegment failed: ${e?.message || e}`,
        ),
      );
    }

    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'transcription.segment',
      entityId: `${transcriptionId}:${segmentId}`,
      before,
      after: segments[idx],
      meta,
    });
    return this.toDto(updated);
  }

  async bulkUpdateSegments(
    userId: string,
    transcriptionId: string,
    dto: BulkUpdateSegmentsDto,
    meta?: AuditMeta,
  ) {
    const t = await this.requireOwnedTranscription(userId, transcriptionId);
    this.ensureEditable(t);

    const updates = dto?.updates ?? [];
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new BadRequestException('updates é obrigatório');
    }

    const byId = new Map<string, { text?: string; speaker?: string }>();
    for (const u of updates) {
      if (!u?.id) continue;
      byId.set(String(u.id), { text: u.text, speaker: u.speaker });
    }

    const segments = Array.isArray(t.segments)
      ? t.segments.map((s) => {
          const patch = byId.get(String(s.id));
          if (!patch) return s;
          const next: any = { ...s };
          if (patch.text !== undefined) next.text = String(patch.text).trim();
          if (patch.speaker !== undefined) {
            const sp = String(patch.speaker).trim();
            if (sp.length === 0) delete next.speaker;
            else next.speaker = sp;
          }
          return next;
        })
      : [];

    await this.transcriptionsRepo.update({ id: transcriptionId }, {
      segments,
      updatedAt: new Date() as any,
    } as any);

    const updated = await this.requireOwnedTranscription(
      userId,
      transcriptionId,
    );

    // reindex apenas dos segmentos cujo texto foi alterado
    const indexById = new Map<string, number>();
    for (let i = 0; i < segments.length; i++)
      indexById.set(String(segments[i].id), i);

    const changed: Array<{ id: string; text: string }> = [];
    for (const u of updates) {
      if (!u?.id) continue;
      if (u.text !== undefined) {
        const seg = segments[indexById.get(String(u.id)) ?? -1];
        if (seg)
          changed.push({ id: String(seg.id), text: String(seg.text ?? '') });
      }
    }
    if (changed.length) {
      void this.upsertSegmentEmbeddings({
        userId,
        transcriptionId,
        segments: changed,
        indexById,
      }).catch((e) =>
        this.logger.error(
          `[Embeddings] bulkUpdateSegments failed: ${e?.message || e}`,
        ),
      );
    }

    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'transcription.segments',
      entityId: transcriptionId,
      before: { updatedCount: 0 },
      after: { updatedCount: updates.length },
      meta,
    });
    return this.toDto(updated);
  }

  async getSpeakerLabels(userId: string, transcriptionId: string) {
    const t = await this.requireOwnedTranscription(userId, transcriptionId);
    return { labels: t.speakerLabels ?? {} };
  }

  async upsertSpeakerLabels(
    userId: string,
    transcriptionId: string,
    dto: UpsertSpeakerLabelsDto,
    meta?: AuditMeta,
  ) {
    const t = await this.requireOwnedTranscription(userId, transcriptionId);
    const prev = t.speakerLabels ?? {};
    const incoming = dto?.labels ?? {};
    const next = { ...prev, ...incoming };

    // Atualizar os segmentos com os novos labels
    const segments = Array.isArray(t.segments)
      ? t.segments.map((seg) => {
          if (!seg.speaker) return seg;
          const newLabel = incoming[seg.speaker];
          if (newLabel !== undefined && newLabel !== seg.speaker) {
            return { ...seg, speaker: newLabel };
          }
          return seg;
        })
      : [];

    await this.transcriptionsRepo.update({ id: transcriptionId }, {
      speakerLabels: next as any,
      segments: segments as any,
      updatedAt: new Date() as any,
    } as any);

    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'transcription.speaker_labels',
      entityId: transcriptionId,
      before: prev,
      after: next,
      meta,
    });

    const updated = await this.requireOwnedTranscription(
      userId,
      transcriptionId,
    );
    return { labels: next, transcription: this.toDto(updated) };
  }

  /**
   * Chama a API OpenAI para transcrever o áudio.
   */
  private async callOpenAITranscribe(
    buffer: Buffer,
    mimeType: string | undefined,
    fileName: string,
    diarizationEnabled: boolean,
    signal?: AbortSignal,
  ): Promise<{
    segments: TranscriptionSegment[];
    durationSeconds: number;
    model: string;
  }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('OPENAI_API_KEY não configurada.');
    }

    const model = diarizationEnabled
      ? 'gpt-4o-transcribe-diarize'
      : 'whisper-1';
    const responseFormat = diarizationEnabled
      ? 'diarized_json'
      : 'verbose_json';

    const form = new FormData();
    form.append('model', String(model));
    form.append('response_format', String(responseFormat));
    if (diarizationEnabled) form.append('chunking_strategy', 'auto');

    const uploadFile = new File([buffer], fileName || 'audio.m4a', {
      type: mimeType || 'audio/mp4',
    });
    form.append('file', uploadFile);

    const controller = new AbortController();
    const timeoutMs =
      Number(this.config.get('OPENAI_TRANSCRIBE_TIMEOUT_MS')) ||
      OPENAI_TRANSCRIBE_TIMEOUT_MS;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const effectiveSignal = signal ?? controller.signal;

    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: effectiveSignal,
      });
    } finally {
      clearTimeout(t);
    }

    const errText = await response.text();
    if (!response.ok) {
      this.logger.warn(
        `OpenAI transcrição (${model}) falhou: ${response.status} ${errText}`,
      );
      throw new InternalServerErrorException(
        `Falha na transcrição (OpenAI): ${response.status}`,
      );
    }

    const data = JSON.parse(errText) as {
      text?: string;
      duration?: number;
      segments?: Array<{
        id: number | string;
        start: number;
        end: number;
        text: string;
        speaker?: string;
      }>;
    };

    const durationSeconds =
      typeof data.duration === 'number' ? Math.round(data.duration) : 0;
    const rawSegments = data.segments ?? [];
    const segments: TranscriptionSegment[] = rawSegments.map((seg) => ({
      id: String(seg.id),
      startTime: secondsToHms(seg.start),
      endTime: secondsToHms(seg.end),
      text: (seg.text ?? '').trim(),
      ...(seg.speaker != null && seg.speaker !== ''
        ? { speaker: seg.speaker }
        : {}),
    }));

    return { segments, durationSeconds, model };
  }

  /**
   * Extrai SOMENTE o áudio (mono, 16 kHz, 64 kbps) e segmenta em .m4a.
   */
  private async splitToAudioChunks(
    inputPath: string,
    tempDir: string,
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const outputPattern = path.join(tempDir, 'chunk_%03d.m4a');
      const ffmpeg = spawn(
        'ffmpeg',
        [
          '-i',
          inputPath,
          '-vn',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-b:a',
          '64k',
          '-f',
          'segment',
          '-segment_time',
          String(CHUNK_DURATION_SECONDS),
          '-movflags',
          'faststart',
          outputPattern,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const stderr: Buffer[] = [];
      ffmpeg.stderr?.on('data', (c) => stderr.push(c));
      ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
        if (err?.code === 'ENOENT') {
          reject(new Error('FFMPEG_NOT_FOUND'));
        } else {
          reject(err);
        }
      });
      ffmpeg.on('close', (code, signal) => {
        if (signal) return;
        if (code !== 0) {
          reject(new Error(`ffmpeg falhou (${code})`));
          return;
        }
        resolve(undefined);
      });
    }).then(async () => {
      const entries = await fs.readdir(tempDir);
      const chunks = entries
        .filter((f) => f.startsWith('chunk_') && f.endsWith('.m4a'))
        .map((f) => path.join(tempDir, f))
        .sort();
      return chunks;
    });
  }

  /**
   * Processa transcrição em background.
   */
  private async processTranscriptionInBackground(args: {
    id: string;
    userId: string;
    fileBuffer: Buffer;
    mimeType?: string;
    sourceFileName: string;
    diarizationEnabled: boolean;
    audioSeconds: number;
  }): Promise<void> {
    const { id, userId, diarizationEnabled } = args;
    let { fileBuffer, mimeType, sourceFileName } = args;

    this.logger.log(`Transcrição BG iniciada para ${id}`);

    const compressEnabled =
      this.config.get<string>('TRANSCRIPTION_COMPRESS_ENABLED') !== 'false';
    const compressMinBytes =
      Number(this.config.get('TRANSCRIPTION_COMPRESS_MIN_BYTES')) ||
      COMPRESS_MIN_BYTES;
    const compressRatio =
      Number(this.config.get('TRANSCRIPTION_COMPRESS_RATIO')) || 0.1;

    if (compressEnabled && fileBuffer.length >= compressMinBytes) {
      try {
        this.logger.log(
          `Comprimindo mídia: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB → ~${(compressRatio * 100).toFixed(0)}%`,
        );
        const { buffer, mimeType: outMime } =
          await compressMediaForTranscription(
            fileBuffer,
            mimeType,
            sourceFileName,
            compressRatio,
          );
        fileBuffer = buffer;
        mimeType = outMime;
        sourceFileName =
          sourceFileName.replace(/\.[^.]+$/, '.m4a') || 'audio.m4a';
        this.logger.log(
          `Compressão concluída: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Compressão falhou (continuando com original): ${msg}`,
        );
      }
    }

    const t = await this.transcriptionsRepo.findOne({ where: { id } } as any);
    if (t && !t.storageFileId) {
      try {
        const uploadRes = await this.storage.upload(
          {
            buffer: fileBuffer,
            originalname: sourceFileName,
            mimetype: mimeType,
          },
          'transcriptions',
          false,
          true,
        );
        if (uploadRes?.id) {
          await this.transcriptionsRepo.update({ id }, {
            storageFileId: uploadRes.id,
            updatedAt: new Date(),
          } as any);
          this.logger.log(
            `[Storage] Áudio salvo para transcrição ${id}: ${uploadRes.id}`,
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Upload storage do áudio falhou (mídia não disponível): ${msg}`,
        );
      }
    }

    await this.transcriptionsRepo.update({ id }, {
      status: 'processing',
      errorMessage: null,
      updatedAt: new Date() as any,
    } as any);

    const concurrency = Math.min(
      Number(this.config.get('OPENAI_TRANSCRIBE_CONCURRENCY') ?? 4),
      16,
    );

    // AssemblyAI aceita até ~5 GB por request: diarização = sempre 1 request com arquivo inteiro
    if (diarizationEnabled) {
      const result = await retry(
        () =>
          this.aiOrchestrator.transcribeWithAssemblyAI(
            fileBuffer,
            mimeType,
            sourceFileName,
            { userId, requestId: id, callName: 'transcriptions.create' },
          ),
        3,
      );
      await this.transcriptionsRepo.update({ id }, {
        segments: result.segments,
        status: 'done',
        errorMessage: null,
        updatedAt: new Date() as any,
      } as any);

      // indexa embeddings (fire-and-forget)
      void this.indexAllSegmentsEmbeddings(userId, {
        ...(await this.transcriptionsRepo.findOne({ where: { id } } as any))!,
      } as any).catch((e) =>
        this.logger.error(
          `[Embeddings] index (assemblyai) failed: ${e?.message || e}`,
        ),
      );

      this.logger.log(
        `Transcrição concluída para ${id} (AssemblyAI): ${result.segments.length} segmentos`,
      );
      void this.autoGenerateIceBreakers(userId, id);
      this.emitTranscriptionStatus(userId, id, 'done', {
        title: baseName(sourceFileName),
      });
      return;
    }

    // OpenAI Whisper: até 25 MB por request — arquivo pequeno = 1 request
    if (fileBuffer.length <= OPENAI_TRANSCRIPTION_MAX_BYTES) {
      const result = await retry(
        () =>
          this.callOpenAITranscribe(
            fileBuffer,
            mimeType,
            sourceFileName,
            false,
          ),
        3,
      );
      await this.transcriptionsRepo.update({ id }, {
        segments: result.segments,
        status: 'done',
        errorMessage: null,
        updatedAt: new Date() as any,
      } as any);

      // indexa embeddings (fire-and-forget)
      void this.indexAllSegmentsEmbeddings(userId, {
        ...(await this.transcriptionsRepo.findOne({ where: { id } } as any))!,
      } as any).catch((e) =>
        this.logger.error(
          `[Embeddings] index (whisper small) failed: ${e?.message || e}`,
        ),
      );

      await this.aiUsage.record({
        kind: 'transcription',
        model: result.model,
        userId,
        requestId: id,
        callName: 'transcriptions.create',
        promptTokens: result.durationSeconds,
      });
      this.logger.log(`Transcrição concluída para ${id}`);
      void this.autoGenerateIceBreakers(userId, id);
      this.emitTranscriptionStatus(userId, id, 'done', {
        title: baseName(sourceFileName),
      });
      return;
    }

    // OpenAI Whisper: arquivo grande = chunking (apenas para Whisper)
    const ext = path.extname(sourceFileName) || '.mp4';
    const tempDir = path.join(os.tmpdir(), `transcribe_${crypto.randomUUID()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const inputPath = path.join(tempDir, `input${ext}`);

    try {
      await fs.writeFile(inputPath, fileBuffer);
      const chunkPaths = await this.splitToAudioChunks(inputPath, tempDir);
      if (!chunkPaths.length) {
        throw new Error('ffmpeg não gerou chunks');
      }

      const chunkDurations = await Promise.all(
        chunkPaths.map(async (p) => {
          const b = await fs.readFile(p);
          const d = await getAudioDurationSeconds(b, 'audio/mp4');
          return d > 0 ? d : CHUNK_DURATION_SECONDS;
        }),
      );

      const offsets: number[] = [];
      let acc = 0;
      for (let i = 0; i < chunkDurations.length; i++) {
        offsets[i] = acc;
        acc += chunkDurations[i];
      }

      const tasks = chunkPaths.map((chunkPath, i) => async () => {
        const chunkBuffer = await fs.readFile(chunkPath);
        this.logger.log(
          `Chunk ${i}: ${(chunkBuffer.length / 1024 / 1024).toFixed(2)} MB`,
        );
        if (chunkBuffer.length > OPENAI_TRANSCRIPTION_MAX_BYTES) {
          throw new InternalServerErrorException(`Chunk ${i} > 25 MB`);
        }
        const result = await retry(
          () =>
            this.callOpenAITranscribe(
              chunkBuffer,
              'audio/mp4',
              `chunk_${i}.m4a`,
              false,
            ),
          3,
        );
        this.logger.log(`Chunk ${i} transcrição ok`);
        const off = offsets[i];
        const adjusted: TranscriptionSegment[] = result.segments.map((seg) => {
          const startSec = hmsToSeconds(seg.startTime);
          const endSec = seg.endTime ? hmsToSeconds(seg.endTime) : startSec;
          return {
            ...seg,
            id: `${i}-${seg.id}`,
            startTime: secondsToHms(off + startSec),
            endTime: secondsToHms(off + endSec),
          };
        });
        return {
          i,
          adjusted,
          durationSeconds: result.durationSeconds,
          model: result.model,
        };
      });

      const results = await runPool(tasks, concurrency);
      results.sort((a, b) => a.i - b.i);
      const allSegments = results.flatMap((r) => r.adjusted);
      const usedModel = results.find((r) => r.model)?.model ?? 'whisper-1';

      this.logger.log(
        `Transcrição concluída para ${id}: ${allSegments.length} segmentos`,
      );
      await this.transcriptionsRepo.update({ id }, {
        segments: allSegments,
        status: 'done',
        errorMessage: null,
        updatedAt: new Date() as any,
      } as any);

      // indexa embeddings (fire-and-forget)
      void this.indexAllSegmentsEmbeddings(userId, {
        ...(await this.transcriptionsRepo.findOne({ where: { id } } as any))!,
      } as any).catch((e) =>
        this.logger.error(
          `[Embeddings] index (whisper chunk) failed: ${e?.message || e}`,
        ),
      );

      await this.aiUsage.record({
        kind: 'transcription',
        model: usedModel,
        userId,
        requestId: id,
        callName: 'transcriptions.create',
        promptTokens: acc,
      });

      void this.autoGenerateIceBreakers(userId, id);
      this.emitTranscriptionStatus(userId, id, 'done', {
        title: baseName(sourceFileName),
      });
    } catch (err: any) {
      this.logger.error(
        `Transcrição BG erro para ${id}: ${err?.message ?? err}`,
      );
      throw err;
    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  // ---------- Transcriptions ----------

  async list(userId: string, q: ListTranscriptionsQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const skip = (page - 1) * limit;

    const qb = this.transcriptionsRepo
      .createQueryBuilder('t')
      .where(
        new Brackets((wqb) => {
          wqb
            .where('t.user_id = :userId', { userId })
            .orWhere(
              `EXISTS (SELECT 1 FROM transcription_shared_with sw WHERE sw.transcription_id = t.id AND sw.shared_with_user_id = :userId)`,
              { userId },
            )
            .orWhere(TranscriptionsService.FOLDER_SHARED_WITH_USER_EXISTS, {
              userId,
            });
        }),
      )
      .andWhere('t.deleted_at IS NULL');

    if (q.search) {
      qb.andWhere('(t.title ILIKE :s OR t.source_file_name ILIKE :s)', {
        s: `%${q.search}%`,
      });
    }

    if (q.tag) {
      qb.andWhere(':tag = ANY(t.tags)', { tag: q.tag });
    }

    if (q.folderId !== undefined && q.folderId !== null && q.folderId !== '') {
      qb.andWhere('t.folder_id = :folderId', { folderId: q.folderId });
    } else if (q.folderId === null || q.folderId === '') {
      qb.andWhere('t.folder_id IS NULL');
    }

    qb.orderBy('t.created_at', 'DESC').skip(skip).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const data = rows.map((t) => this.toDto(t));
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async get(userId: string, id: string) {
    const t = await this.requireTranscriptionAccess(userId, id);
    const path = await this.transcriptionFoldersService.getFolderPath(
      userId,
      t.folderId,
    );
    const fullPath = path.length > 0 ? [...path, t.title] : [t.title];
    return this.toDto(t, fullPath);
  }

  /**
   * Explorador estilo Windows: pastas e transcrições na pasta atual (ou busca global).
   * - Sem search: retorna currentPath (breadcrumb), subpastas e transcrições na pasta folderId (raiz se null).
   * - Com search: retorna pastas e transcrições cujo nome/título batem com a busca, com path de cada um.
   */
  async explorer(userId: string, q: ExplorerQueryDto) {
    const folderId =
      q.folderId === undefined || q.folderId === null || q.folderId === ''
        ? null
        : q.folderId;
    const search = q.search?.trim();

    const currentPath = await this.transcriptionFoldersService.getFolderPath(
      userId,
      folderId,
    );
    const pathItems = await this.transcriptionFoldersService.getFolderPathItems(
      userId,
      folderId,
    );

    if (search) {
      const [folders, transcriptions] = await Promise.all([
        this.searchFoldersWithPath(userId, search),
        this.searchTranscriptionsWithPath(userId, search),
      ]);
      return {
        currentPath,
        pathItems,
        folders,
        transcriptions,
        search,
      };
    }

    const [folders, transcriptions] = await Promise.all([
      this.transcriptionFoldersService.list(userId, folderId),
      this.listTranscriptionsInFolder(userId, folderId),
    ]);

    const transcriptionDtos = transcriptions.map((t) =>
      this.toDto(
        t,
        currentPath.length > 0 ? [...currentPath, t.title] : [t.title],
      ),
    );

    return {
      currentPath,
      pathItems,
      folders,
      transcriptions: transcriptionDtos,
    };
  }

  /**
   * Explorador "compartilhadas comigo": pastas e transcrições que um usuário compartilhou comigo.
   * Uso: no front, listar usuários como "pastas"; ao entrar no usuário, ver pastas/transcrições dele (José/pasta/transcrição).
   */
  async explorerSharedWithMe(
    myUserId: string,
    q: SharedWithMeExplorerQueryDto,
  ) {
    const sharedByUserId = q.sharedByUserId;
    const folderId =
      q.folderId === undefined || q.folderId === null || q.folderId === ''
        ? null
        : q.folderId;

    const [sharedIds, sharedFolderIdsWithDescendants] = await Promise.all([
      this.transcriptionSharesService.getSharedTranscriptionIdsByOwner(
        myUserId,
        sharedByUserId,
      ),
      this.transcriptionSharesService.getSharedFolderIdsWithDescendantsByOwner(
        myUserId,
        sharedByUserId,
      ),
    ]);

    const currentPath = await this.transcriptionFoldersService.getFolderPath(
      sharedByUserId,
      folderId,
    );
    const pathItems = await this.transcriptionFoldersService.getFolderPathItems(
      sharedByUserId,
      folderId,
    );

    const visibleFolderIds = new Set<string>(sharedFolderIdsWithDescendants);

    if (sharedIds.length > 0) {
      const sharedList = await this.transcriptionsRepo.find({
        where: { id: In(sharedIds) },
        select: { id: true, folderId: true },
      });
      for (const t of sharedList) {
        const items = await this.transcriptionFoldersService.getFolderPathItems(
          sharedByUserId,
          t.folderId,
        );
        for (const item of items) {
          if (item.id) visibleFolderIds.add(item.id);
        }
      }
    }

    if (sharedIds.length === 0 && visibleFolderIds.size === 0) {
      return {
        currentPath,
        pathItems,
        folders: [],
        transcriptions: [],
      };
    }

    const [allFoldersInCurrent, transcriptionsInFolder] = await Promise.all([
      this.transcriptionFoldersService.list(sharedByUserId, folderId),
      this.listTranscriptionsInFolderSharedWithMe(
        sharedByUserId,
        folderId,
        sharedIds,
      ),
    ]);

    const folders = allFoldersInCurrent.filter((f) =>
      visibleFolderIds.has(f.id),
    );

    const transcriptionDtos = transcriptionsInFolder.map((t) =>
      this.toDto(
        t,
        currentPath.length > 0 ? [...currentPath, t.title] : [t.title],
      ),
    );

    return {
      currentPath,
      pathItems,
      folders,
      transcriptions: transcriptionDtos,
    };
  }

  private async listTranscriptionsInFolderSharedWithMe(
    ownerUserId: string,
    folderId: string | null,
    sharedIds: string[],
  ): Promise<Transcriptor[]> {
    if (sharedIds.length === 0) return [];
    const qb = this.transcriptionsRepo
      .createQueryBuilder('t')
      .select(TranscriptionsService.EXPLORER_SELECT)
      .where('t.user_id = :ownerUserId', { ownerUserId })
      .andWhere('t.id IN (:...sharedIds)', { sharedIds })
      .andWhere('t.deleted_at IS NULL');

    if (folderId === null || folderId === undefined) {
      qb.andWhere('t.folder_id IS NULL');
    } else {
      qb.andWhere('t.folder_id = :folderId', { folderId });
    }
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  /** Colunas da transcrição sem segments, para listagens/explorer (evita carregar JSONB pesado). */
  private static readonly EXPLORER_SELECT: string[] = [
    't.id',
    't.user_id',
    't.folder_id',
    't.title',
    't.source_file_name',
    't.storage_file_id',
    't.diarization_enabled',
    't.duration_seconds',
    't.status',
    't.error_message',
    't.speaker_labels',
    't.tags',
    't.created_at',
    't.updated_at',
    't.deleted_at',
  ];

  /** SQL EXISTS: transcrição visível porque está em pasta compartilhada com o usuário. */
  private static readonly FOLDER_SHARED_WITH_USER_EXISTS = `t.folder_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE shared_tree AS (
      SELECT fsw.folder_id AS id, fsw.created_by_user_id AS owner
      FROM transcription_folder_shared_with fsw
      WHERE fsw.shared_with_user_id = :userId
      UNION ALL
      SELECT f.id, f.user_id
      FROM transcription_folder f
      INNER JOIN shared_tree st ON f.parent_id = st.id AND f.user_id = st.owner
      WHERE f.deleted_at IS NULL
    )
    SELECT 1 FROM shared_tree st WHERE st.id = t.folder_id AND st.owner = t.user_id
  )`;

  private async listTranscriptionsInFolder(
    userId: string,
    folderId: string | null,
  ): Promise<Transcriptor[]> {
    const qb = this.transcriptionsRepo
      .createQueryBuilder('t')
      .select(TranscriptionsService.EXPLORER_SELECT)
      .where(
        new Brackets((wqb) => {
          wqb
            .where('t.user_id = :userId', { userId })
            .orWhere(
              `EXISTS (SELECT 1 FROM transcription_shared_with sw WHERE sw.transcription_id = t.id AND sw.shared_with_user_id = :userId)`,
              { userId },
            )
            .orWhere(TranscriptionsService.FOLDER_SHARED_WITH_USER_EXISTS, {
              userId,
            });
        }),
      )
      .andWhere('t.deleted_at IS NULL');

    if (folderId === null || folderId === undefined) {
      qb.andWhere('t.folder_id IS NULL');
    } else {
      qb.andWhere('t.folder_id = :folderId', { folderId });
    }
    qb.orderBy('t.created_at', 'DESC');
    return qb.getMany();
  }

  private async searchFoldersWithPath(
    userId: string,
    search: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      parentId: string | null;
      path: string[];
      pathString: string;
    }>
  > {
    const all: Array<{ id: string; name: string; parentId: string | null }> =
      [];
    const collect = async (parentId: string | null) => {
      const list = await this.transcriptionFoldersService.list(
        userId,
        parentId,
      );
      for (const f of list) {
        all.push({ id: f.id, name: f.name, parentId: parentId ?? null });
        await collect(f.id);
      }
    };
    await collect(null);
    const term = search.toLowerCase();
    const matching = all.filter((f) => f.name.toLowerCase().includes(term));
    const result: Array<{
      id: string;
      name: string;
      parentId: string | null;
      path: string[];
      pathString: string;
    }> = [];
    for (const f of matching) {
      const path = await this.transcriptionFoldersService.getFolderPath(
        userId,
        f.id,
      );
      result.push({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        path,
        pathString: path.join('\\'),
      });
    }
    return result;
  }

  private async searchTranscriptionsWithPath(userId: string, search: string) {
    const qb = this.transcriptionsRepo
      .createQueryBuilder('t')
      .select(TranscriptionsService.EXPLORER_SELECT)
      .where(
        new Brackets((wqb) => {
          wqb
            .where('t.user_id = :userId', { userId })
            .orWhere(
              `EXISTS (SELECT 1 FROM transcription_shared_with sw WHERE sw.transcription_id = t.id AND sw.shared_with_user_id = :userId)`,
              { userId },
            )
            .orWhere(TranscriptionsService.FOLDER_SHARED_WITH_USER_EXISTS, {
              userId,
            });
        }),
      )
      .andWhere('t.deleted_at IS NULL')
      .andWhere('(t.title ILIKE :s OR t.source_file_name ILIKE :s)', {
        s: `%${search}%`,
      })
      .orderBy('t.created_at', 'DESC');
    const rows = await qb.getMany();
    const dtos = await Promise.all(
      rows.map(async (t) => {
        const path = await this.transcriptionFoldersService.getFolderPath(
          userId,
          t.folderId,
        );
        const fullPath = path.length > 0 ? [...path, t.title] : [t.title];
        return this.toDto(t, fullPath);
      }),
    );
    return dtos;
  }

  /**
   * Resolve uma transcrição pelo caminho completo (ex: "Documentos\\Reuniões\\Daily 12-02").
   * Último segmento = título da transcrição; demais = pasta(s). Retorna 404 se não existir.
   * Se houver mais de uma transcrição com mesmo título na mesma pasta, retorna a primeira.
   */
  async resolveByPath(
    userId: string,
    pathRaw: string,
  ): Promise<{
    type: 'transcription';
    transcription: ReturnType<TranscriptionsService['toDto']>;
    path: string[];
    pathString: string;
  }> {
    const segments = pathRaw
      .replace(/\//g, '\\')
      .split('\\')
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length === 0) {
      throw new NotFoundException(
        'Caminho inválido. Use o formato: Pasta1\\Pasta2\\Título da transcrição',
      );
    }
    const title = segments[segments.length - 1];
    let folderId: string | null = null;
    if (segments.length > 1) {
      const folderPath = segments.slice(0, -1).join('\\');
      const resolved = await this.transcriptionFoldersService.resolveByPath(
        userId,
        folderPath,
      );
      folderId = resolved.folder.id;
    }
    const qb = this.transcriptionsRepo
      .createQueryBuilder('t')
      .where(
        new Brackets((wqb) => {
          wqb
            .where('t.user_id = :userId', { userId })
            .orWhere(
              `EXISTS (SELECT 1 FROM transcription_shared_with sw WHERE sw.transcription_id = t.id AND sw.shared_with_user_id = :userId)`,
              { userId },
            )
            .orWhere(TranscriptionsService.FOLDER_SHARED_WITH_USER_EXISTS, {
              userId,
            });
        }),
      )
      .andWhere('t.deleted_at IS NULL')
      .andWhere('t.title = :title', { title });
    if (folderId === null) {
      qb.andWhere('t.folder_id IS NULL');
    } else {
      qb.andWhere('t.folder_id = :folderId', { folderId });
    }
    qb.orderBy('t.created_at', 'DESC').take(1);
    const t = await qb.getOne();
    if (!t) {
      throw new NotFoundException(
        `Transcrição não encontrada no caminho: "${pathRaw}"`,
      );
    }
    const path = await this.transcriptionFoldersService.getFolderPath(
      userId,
      t.folderId,
    );
    const fullPath = path.length > 0 ? [...path, t.title] : [t.title];
    return {
      type: 'transcription',
      transcription: this.toDto(t, fullPath),
      path: fullPath,
      pathString: fullPath.join('\\'),
    };
  }

  async create(
    userId: string,
    file: any,
    diarizationEnabled: boolean,
    meta?: AuditMeta,
    folderIdParam?: string | null,
  ) {
    if (!file) throw new BadRequestException('Arquivo é obrigatório');
    if (!file.buffer && !file.stream) {
      throw new BadRequestException('Arquivo inválido');
    }

    let durationSeconds = 0;
    if (file.buffer && file.buffer.length > 0) {
      durationSeconds = await getAudioDurationSeconds(
        file.buffer,
        file.mimetype,
      );
    }

    const compressEnabled =
      this.config.get<string>('TRANSCRIPTION_COMPRESS_ENABLED') !== 'false';
    const compressMinBytes =
      Number(this.config.get('TRANSCRIPTION_COMPRESS_MIN_BYTES')) ||
      COMPRESS_MIN_BYTES;
    const bufferSize = file.buffer?.length ?? 0;
    const skipUpload = compressEnabled && bufferSize >= compressMinBytes;

    let uploadRes: { id?: string } | null = null;
    if (!skipUpload) {
      try {
        uploadRes = await this.storage.upload(
          file,
          'transcriptions',
          false,
          true,
        );
      } catch (err: any) {
        const cause =
          err instanceof AggregateError && err.errors?.length
            ? err.errors[0]
            : err;
        const message = cause?.message ?? String(cause);
        const isPayloadTooLarge =
          message.includes('413') ||
          message.includes('Payload Too Large') ||
          message.includes('File too large') ||
          message.includes('too large');
        if (isPayloadTooLarge) {
          this.logger.log(`Upload storage ignorado (arquivo grande)`);
          uploadRes = null;
        } else {
          this.logger.warn(`Upload storage falhou: ${message}`);
          throw new InternalServerErrorException(
            `Falha ao enviar áudio para o storage.`,
          );
        }
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const sourceFileName = file.originalname ?? 'audio';

    const entity: Partial<Transcriptor> = {
      id,
      userId,
      folderId: folderIdParam ?? null,
      title: baseName(sourceFileName),
      sourceFileName,
      storageFileId: uploadRes?.id ?? null,
      diarizationEnabled,
      durationSeconds,
      status: 'processing',
      errorMessage: null,
      segments: [],
      speakerLabels: {},
      tags: [],
      createdAt: now as any,
      updatedAt: now as any,
      deletedAt: null,
    };

    try {
      await this.transcriptionsRepo.insert(entity as any);
    } catch (err: any) {
      const cause =
        err instanceof AggregateError && err.errors?.length
          ? err.errors[0]
          : err;
      this.logger.error(`Insert transcrição falhou: ${cause?.message}`);
      throw new InternalServerErrorException('Falha ao salvar transcrição.');
    }

    const created = await this.transcriptionsRepo.findOne({ where: { id } });
    const audioSeconds = durationSeconds || 0;

    const fileBufferCopy = Buffer.from(file.buffer);

    // Processamento em background
    void this.processTranscriptionInBackground({
      id,
      userId,
      fileBuffer: fileBufferCopy,
      mimeType: file.mimetype,
      sourceFileName,
      diarizationEnabled,
      audioSeconds,
    }).catch(async (err: any) => {
      const message =
        err?.message ??
        err?.response?.message ??
        (typeof err === 'string' ? err : String(err));
      this.logger.warn(`BG transcribe failed ${id}: ${message}`);
      const errorMessage = message.slice(0, 500);
      await this.transcriptionsRepo.update({ id }, {
        status: 'error',
        errorMessage,
        updatedAt: new Date() as any,
      } as any);
      // Notifica via WebSocket (realtime) que falhou
      this.emitTranscriptionStatus(userId, id, 'error', {
        title: baseName(sourceFileName),
        errorMessage,
      });
    });

    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'transcription',
      entityId: id,
      before: null,
      after: created ? this.toDto(created) : entity,
      meta,
    });

    return created ? this.toDto(created) : (entity as any);
  }

  /**
   * Cria transcrição a partir dos segmentos do Google Meet (legendas em tempo real).
   * Usado quando a reunião termina e salvamos a transcrição capturada do HTML.
   */
  async createFromMeetTranscription(
    userId: string,
    args: {
      title: string;
      sourceFileName: string;
      meetUrl: string;
      segments: Array<{
        speaker?: string;
        text: string;
        imageUrl?: string;
        startTimeMs?: number;
      }>;
    },
    meta?: AuditMeta,
  ) {
    const { title, sourceFileName, meetUrl, segments } = args;
    const id = crypto.randomUUID();
    const now = new Date();

    // Normaliza timestamps para serem relativos ao primeiro segmento (base = 0)
    const validMs = segments
      .map((s) => s.startTimeMs)
      .filter((v): v is number => v != null && !Number.isNaN(v));
    const baseMs = validMs.length > 0 ? Math.min(...validMs) : 0;

    const transcriptionSegments: TranscriptionSegment[] = segments.map(
      (s, i) => {
        const segId = `meet-${i}`;
        let startTime = '00:00:00';
        let endTime: string | undefined;
        if (s.startTimeMs != null && !Number.isNaN(s.startTimeMs)) {
          const relMs = s.startTimeMs - baseMs;
          const sec = Math.max(0, Math.floor(relMs / 1000));
          startTime = secondsToHms(sec);
          endTime = secondsToHms(sec + 1);
        } else {
          startTime = secondsToHms(i);
          endTime = secondsToHms(i + 1);
        }
        return {
          id: segId,
          startTime,
          endTime,
          text: (s.text ?? '').trim(),
          ...(s.speaker ? { speaker: s.speaker } : {}),
        };
      },
    );

    const totalSeconds = transcriptionSegments.length;

    const entity: Partial<Transcriptor> = {
      id,
      userId,
      title: title || baseName(sourceFileName),
      sourceFileName,
      storageFileId: null,
      diarizationEnabled: true,
      durationSeconds: totalSeconds,
      status: 'done',
      errorMessage: null,
      segments: transcriptionSegments,
      speakerLabels: {},
      tags: ['meet'],
      createdAt: now as any,
      updatedAt: now as any,
      deletedAt: null,
    };

    try {
      await this.transcriptionsRepo.insert(entity as any);
    } catch (err: any) {
      this.logger.error(`Insert transcrição Meet falhou: ${err?.message}`);
      throw new InternalServerErrorException(
        'Falha ao salvar transcrição do Meet.',
      );
    }

    const created = await this.transcriptionsRepo.findOne({ where: { id } });
    if (!created)
      throw new InternalServerErrorException('Transcrição não criada');

    void this.indexAllSegmentsEmbeddings(userId, created as any).catch((e) =>
      this.logger.error(
        `[Embeddings] Meet transcription failed: ${e?.message || e}`,
      ),
    );
    void this.autoGenerateIceBreakers(userId, id);
    this.emitTranscriptionStatus(userId, id, 'done', { title });

    await this.audit.record({
      userId,
      action: 'CREATE',
      entity: 'transcription',
      entityId: id,
      before: null,
      after: { ...this.toDto(created), meetUrl },
      meta,
    });

    return this.toDto(created);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTranscriptionDto,
    meta?: AuditMeta,
  ) {
    const t = await this.requireOwnedTranscription(userId, id);
    const before = this.toDto(t);

    const patch: Partial<Transcriptor> = {};
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.folderId !== undefined) patch.folderId = dto.folderId ?? null;

    await this.transcriptionsRepo.update({ id }, patch as any);
    const updated = await this.requireOwnedTranscription(userId, id);

    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'transcription',
      entityId: id,
      before,
      after: this.toDto(updated),
      meta,
    });

    return this.toDto(updated);
  }

  async softDelete(userId: string, id: string, meta?: AuditMeta) {
    const t = await this.requireOwnedTranscription(userId, id);
    const before = this.toDto(t);
    await this.transcriptionsRepo.update(
      { id },
      { deletedAt: new Date() as any },
    );

    await this.audit.record({
      userId,
      action: 'DELETE',
      entity: 'transcription',
      entityId: id,
      before,
      after: { ...before, deletedAt: new Date().toISOString() },
      meta,
    });

    return { ok: true };
  }

  // ---------- Media ----------

  async getMediaMeta(userId: string, id: string) {
    const t = await this.requireTranscriptionAccess(userId, id);
    if (!t.storageFileId) throw new BadRequestException('Sem mídia vinculada');
    return {
      fileId: t.storageFileId,
      streamPath: `/transcriptions/${id}/media/stream`,
      durationSeconds: t.durationSeconds,
      durationFormatted: formatDuration(t.durationSeconds),
    };
  }

  async streamMedia(
    userId: string,
    id: string,
    res: any,
    opts?: { download?: string; range?: string },
  ) {
    const t = await this.requireTranscriptionAccess(userId, id);
    if (!t.storageFileId) throw new BadRequestException('Sem mídia vinculada');
    try {
      await this.storage.pipeStreamToResponse(t.storageFileId, res, opts);
    } catch (err: any) {
      const cause =
        err instanceof AggregateError && err.errors?.length
          ? err.errors[0]
          : err;
      const message = cause?.message ?? String(cause);
      this.logger.warn(
        `streamMedia ${id} storage error: ${message}. AggregateErrors: ${err instanceof AggregateError ? (err as AggregateError).errors?.length : 0}`,
      );
      if (!res.headersSent) {
        throw new InternalServerErrorException(
          `Falha ao obter stream da mídia: ${message}`,
        );
      }
      throw err;
    }
  }

  // ---------- Tags ----------

  async addTags(
    userId: string,
    id: string,
    dto: UpsertTagsDto,
    meta?: AuditMeta,
  ) {
    const t = await this.requireOwnedTranscription(userId, id);
    const before = this.toDto(t);

    const incoming = dto.tags ?? (dto.tag ? [dto.tag] : []);
    const cleaned = incoming
      .map((x) => (x ?? '').trim())
      .filter((x) => x.length > 0);
    const next = Array.from(new Set([...(t.tags ?? []), ...cleaned]));

    await this.transcriptionsRepo.update({ id }, { tags: next } as any);
    const updated = await this.requireOwnedTranscription(userId, id);

    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'transcription.tags',
      entityId: id,
      before: { tags: before.tags },
      after: { tags: updated.tags },
      meta,
    });

    return this.toDto(updated);
  }

  async removeTag(userId: string, id: string, tag: string, meta?: AuditMeta) {
    const t = await this.requireOwnedTranscription(userId, id);
    const before = this.toDto(t);
    const norm = decodeURIComponent(tag).trim();
    const next = (t.tags ?? []).filter((x) => x !== norm);
    await this.transcriptionsRepo.update({ id }, { tags: next } as any);
    const updated = await this.requireOwnedTranscription(userId, id);

    await this.audit.record({
      userId,
      action: 'UPDATE',
      entity: 'transcription.tags',
      entityId: id,
      before: { tags: before.tags },
      after: { tags: updated.tags },
      meta,
    });

    return this.toDto(updated);
  }

  /**
   * Gera ice breakers automaticamente após a transcrição ser concluída.
   * Executa em background (fire-and-forget) para não bloquear o fluxo principal.
   */
  private async autoGenerateIceBreakers(
    userId: string,
    transcriptionId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `[Auto Ice Breakers] Iniciando geração automática para transcrição ${transcriptionId}`,
      );

      // Verifica se já existem ice breakers
      const hasIceBreakers =
        await this.iceBreakersService.hasIceBreakers(transcriptionId);

      if (hasIceBreakers) {
        this.logger.log(
          `[Auto Ice Breakers] Transcrição ${transcriptionId} já possui ice breakers. Pulando geração automática.`,
        );
        return;
      }

      // Gera 5 ice breakers automaticamente (sem auditMeta)
      await this.iceBreakersService.generate(
        userId,
        transcriptionId,
        { count: 5 },
        undefined, // sem auditMeta para não poluir logs
      );

      this.logger.log(
        `[Auto Ice Breakers] Ice breakers gerados automaticamente para transcrição ${transcriptionId}`,
      );
    } catch (error) {
      // Não propaga o erro para não quebrar o fluxo principal
      this.logger.error(
        `[Auto Ice Breakers] Erro ao gerar ice breakers automaticamente para ${transcriptionId}: ${error?.message || error}`,
      );
    }
  }
}
