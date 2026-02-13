import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AssemblyAI } from 'assemblyai';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiUsageService } from './ai-usage.service';

/** Segmento de transcrição compatível com o formato interno (transcriptor). */
export type TranscriptionSegmentLike = {
  id: string;
  startTime: string;
  endTime?: string;
  text: string;
  speaker?: string;
};

// ===================== Tipos auxiliares (texto) =====================
// ===================== Tipos auxiliares (embeddings) =====================
type EmbeddingOptions = {
  /** modelo de embeddings (default via env AI_EMBEDDING_MODEL) */
  model?: string;
  timeoutMs?: number;
  retries?: number;
  /** rastreamento */
  userId?: string;
  userName?: string;
  callName?: string;
};

type StrictTextOptions = {
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
  chunkMode?: 'chars' | 'lines';
  /**
   * ✅ NOVO: preserva blocos [[...]] que NÃO sejam placeholders (ex.: [[texto livre]]).
   * Útil para marcar trechos/parágrafos imutáveis em texto que passa por LLM.
   */
  preserveNonPlaceholderDoubleBrackets?: boolean;
};

type TextTransformStep = {
  /**
   * Prompt template do step.
   *
   * Variáveis suportadas por padrão:
   * - {{INPUT_TEXT}}: texto original de entrada
   * - {{CURRENT_TEXT}}: texto corrente (saída do step anterior)
   * - {{STEP_INDEX}} / {{STEP_NUMBER}}
   * - {{TOTAL_STEPS}}
   */
  promptTemplate: string;
  model?: string;
  opts?: StrictTextOptions;
};

type ImmutableBracketBlock = {
  token: string;
  original: string;
};

/**
 * Orquestrador genérico de IA para todo o sistema.
 * Implementa uma chamada de JSON estrito usando OpenAI (padrão: gpt-4o-mini),
 * mas pode ser estendido para outros provedores/modelos.
 * Requer: process.env.OPENAI_API_KEY
 * Dependência sugerida: "openai" ^4 (npm i openai)
 */
@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly DEFAULT_TIMEOUT_MS = Number(
    process.env.AI_TIMEOUT_MS ?? 20000,
  );
  private readonly RAW_PREVIEW_LIMIT = Number(
    process.env.AI_RAW_PREVIEW_LIMIT ?? 2000,
  );

  constructor(private readonly aiUsage: AiUsageService) {}

  // ===================== Helpers utilitários =====================
  private escapeRegExp(s: string) {
    return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Converte embedding (number[]) para formato aceito pelo pgvector: "[0.1,0.2,...]" */
  private toPgVectorString(v: number[]): string {
    const arr = Array.isArray(v) ? v : [];
    // mantém precisão suficiente, mas evita notação científica bizarra
    return `[${arr.map((n) => Number(n).toString()).join(',')}]`;
  }

  /**
   * Heurística: distingue placeholders do sistema (ex.: [[TOPICOS_ESPECIFICOS]])
   * de blocos de texto livre (ex.: [[texto]]), que devem ser preservados.
   * ✅ Ajuste: considera placeholder somente se tiver underscore
   * Isso permite que [[INSS]], [[CLT]], [[TST]] sejam tratados como imutáveis
   */
  private looksLikePlaceholderKey(inner: string): boolean {
    const t = String(inner ?? '').trim();
    if (!t) return false;
    if (!/^[A-Z0-9_]{2,120}$/.test(t)) return false;
    if (t !== t.toUpperCase()) return false;
    return t.includes('_');
  }

  /**
   * ✅ Protege blocos [[...]] NÃO-placeholder substituindo por tokens estáveis.
   * - Não protege [[PLACEHOLDER_KEY]]
   * - Protege [[texto livre]]
   */
  private protectNonPlaceholderDoubleBrackets(input: string): {
    text: string;
    blocks: ImmutableBracketBlock[];
  } {
    const src = String(input ?? '');
    const blocks: ImmutableBracketBlock[] = [];
    let n = 0;

    const out = src.replace(/\[\[[\s\S]*?\]\]/g, (m) => {
      const inner = m.slice(2, -2);
      if (this.looksLikePlaceholderKey(inner)) return m; // mantém placeholders
      n += 1;
      const token = `__IMMUTABLE_BLOCK_${n}__`;
      blocks.push({ token, original: m });
      return token;
    });

    return { text: out, blocks };
  }

  private restoreNonPlaceholderDoubleBrackets(
    output: string,
    blocks: ImmutableBracketBlock[],
  ): string {
    let out = String(output ?? '');
    for (const b of blocks ?? []) {
      if (!b?.token) continue;
      out = out.split(b.token).join(b.original ?? '');
    }
    return out;
  }

  private deepRestoreNonPlaceholderDoubleBrackets(
    v: any,
    blocks: ImmutableBracketBlock[],
  ): any {
    if (typeof v === 'string') {
      return this.restoreNonPlaceholderDoubleBrackets(v, blocks);
    }
    if (Array.isArray(v)) {
      return v.map((x) =>
        this.deepRestoreNonPlaceholderDoubleBrackets(x, blocks),
      );
    }
    if (this.isPlainObject(v)) {
      const out: any = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = this.deepRestoreNonPlaceholderDoubleBrackets(val, blocks);
      }
      return out;
    }
    return v;
  }

  /**
   * Detecta se o modelo requer max_completion_tokens em vez de max_tokens.
   * Modelos mais recentes (gpt-4o, gpt-4.1, gpt-5.x, o1/o3) usam max_completion_tokens.
   */
  private requiresMaxCompletionTokens(model: string): boolean {
    const m = String(model ?? '').toLowerCase();
    // Modelos que requerem max_completion_tokens
    return (
      // família gpt-4o
      m.includes('gpt-4o') ||
      m.includes('gpt-4o-2024-08-06') ||
      m.includes('gpt-4o-2024-11-20') ||
      // família gpt-4.1 (inclui gpt-4.1-mini, etc.)
      m.startsWith('gpt-4.1') ||
      // família gpt-5 (gpt-5, gpt-5.1, etc.)
      m.startsWith('gpt-5') ||
      m.startsWith('gpt-5-mini') ||
      m.startsWith('gpt-5.1') ||
      // modelos de raciocínio
      m.includes('o1') ||
      m.includes('o3')
    );
  }

  /**
   * Aplica variáveis simples em um prompt template.
   * Substitui ocorrências do tipo {{VARNAME}} (case-sensitive).
   */
  private applyPromptTemplate(template: string, vars: Record<string, string>) {
    let out = String(template ?? '');
    for (const [k, v] of Object.entries(vars ?? {})) {
      const key = this.escapeRegExp(String(k));
      const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      out = out.replace(re, String(v ?? ''));
    }
    return out;
  }

  private isChunkingEnabled() {
    const raw = String(process.env.AI_PROMPT_CHUNKING ?? 'true').toLowerCase();
    return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no');
  }

  private chunkString(s: string, limit: number): string[] {
    const src = String(s ?? '');
    const lim = Math.max(1000, Number(limit || 0));
    if (src.length <= lim) return [src];
    const chunks: string[] = [];

    for (let i = 0; i < src.length; i += lim) {
      chunks.push(src.slice(i, i + lim));
    }
    return chunks;
  }

  /**
   * Chunking por linhas (blocos separados por "\n").
   * Útil quando o input é texto puro e queremos preservar contexto de linha.
   */
  private chunkTextByLines(s: string, limit: number): string[] {
    const src = String(s ?? '');
    const lim = Math.max(1000, Number(limit || 0));
    if (src.length <= lim) return [src];

    const lines = src.split('\n');
    const chunks: string[] = [];
    let acc = '';

    const pushAcc = () => {
      if (acc.trim().length) chunks.push(acc);
      acc = '';
    };

    for (const line of lines) {
      const next = acc.length ? `${acc}\n${line}` : line;
      if (next.length > lim) {
        // se a linha sozinha estoura, cai para o modo de fatias
        if (!acc.length && line.length > lim) {
          chunks.push(...this.chunkString(line, lim));
          continue;
        }
        pushAcc();
        acc = line;
      } else {
        acc = next;
      }
    }

    pushAcc();
    return chunks.length ? chunks : [src];
  }

  private isPlainObject(v: any) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  /**
   * Merge genérico e tolerante para JSONs parciais:
   * - objetos: merge recursivo
   * - arrays: concat
   * - primitivos: "last wins"
   */
  private deepMergeLoose(a: any, b: any): any {
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (this.isPlainObject(a) && this.isPlainObject(b)) {
      const out: any = { ...a };

      for (const k of Object.keys(b)) {
        if (k in out) out[k] = this.deepMergeLoose(out[k], b[k]);
        else out[k] = b[k];
      }
      return out;
    }
    return b ?? a;
  }

  /**
   * Inicia um arquivo de auditoria ÚNICO por chamada de IA e grava o payload imediatamente.
   * Depois, usamos o método append para anexar o RETORNO bruto da IA no MESMO .txt.
   * Qtd de .txt == qtd de chamadas da IA (retries não criam novos arquivos)
   * Sem subpastas (nada de "requests/")
   */
  private async startAuditFile(
    kind: string,
    model: string,
    payload: unknown,
  ): Promise<{ filePath: string; append: (chunk: string) => Promise<void> }> {
    const enabled =
      !!process.env.AI_LOG_PROMPTS && process.env.AI_LOG_PROMPTS !== '0';

    if (!enabled) {
      return {
        filePath: '',
        append: async () => void 0,
      };
    }

    const baseDir =
      process.env.AI_LOG_DIR ||
      path.join(process.cwd(), 'storage', 'ai-prompts');

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeModel = String(model || '')
      .replace(/[^\w.\-]+/g, '_')
      .slice(0, 80);

    const fname = `${ts}-${kind}-${safeModel}.txt`;
    const filePath = path.join(baseDir, fname);
    const body = JSON.stringify(payload, null, 2) + '\n';
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(filePath, body, 'utf8'); // grava o PAYLOAD na hora do envio

    const append = async (chunk: string) => {
      // anexa o RETORNO bruto da IA (sem rótulos), mantendo exatamente o que veio
      await fs.appendFile(filePath, chunk, 'utf8');
    };

    this.logger.log(`[AUDITORIA] Arquivo de IO criado: ${filePath}`);
    return { filePath, append };
  }

  /**
   * Envia um prompt e obriga retorno em JSON válido.
   * Usa chat.completions com response_format { type: "json_object" }.
   */
  async generateStrictJson(
    prompt: string,
    model = process.env.AI_CHECKLIST_MODEL || 'gpt-4o-mini', // 💡 padrão mais rápido
    opts?: {
      maxTokens?: number;
      timeoutMs?: number;
      retries?: number;
      /**
       * Estratégia de chunking:
       * - "chars" (default): fatiamento por tamanho
       * - "lines": preserva linhas de texto
       */
      chunkMode?: 'chars' | 'lines';
      /**
       * JSON Schema para Structured Outputs (strict mode).
       * Quando fornecido, usa json_schema ao invés de json_object.
       */
      jsonSchema?: { name: string; schema: any; strict?: boolean };
      /**
       * Temperatura para reduzir variação de formato.
       * Recomendado: 0 para chamadas de JSON.
       */
      temperature?: number;
      /**
       * ✅ NOVO: preserva blocos [[...]] de texto livre (não-placeholder).
       */
      preserveNonPlaceholderDoubleBrackets?: boolean;
      /**
       * ID do usuário que está fazendo a requisição (opcional).
       * Se não fornecido, o registro de uso não incluirá userId.
       */
      userId?: string;
      /**
       * Nome do usuário que está fazendo a requisição (opcional).
       * Se não fornecido, o registro de uso não incluirá userName.
       */
      userName?: string;

      /**
       * Nome da chamada que está sendo feita (opcional).
       * Se não fornecido, o registro de uso não incluirá callName.
       */
      callName?: string;
    },
  ): Promise<any> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new InternalServerErrorException(
        'OPENAI_API_KEY não configurada no ambiente',
      );

    // Limite defensivo do prompt
    const PROMPT_HARD_LIMIT = Number(
      process.env.AI_PROMPT_CHAR_LIMIT ?? 120_000,
    );

    const chunking = this.isChunkingEnabled();
    const mode = opts?.chunkMode ?? 'chars';
    const rawPrompt = String(prompt || '');
    const protectedPromptPack = opts?.preserveNonPlaceholderDoubleBrackets
      ? this.protectNonPlaceholderDoubleBrackets(rawPrompt)
      : { text: rawPrompt, blocks: [] as ImmutableBracketBlock[] };
    const immutableBlocks = protectedPromptPack.blocks ?? [];
    const effectivePrompt = protectedPromptPack.text;
    const chunks =
      chunking && effectivePrompt.length > PROMPT_HARD_LIMIT
        ? mode === 'lines'
          ? this.chunkTextByLines(effectivePrompt, PROMPT_HARD_LIMIT)
          : this.chunkString(effectivePrompt, PROMPT_HARD_LIMIT)
        : [effectivePrompt];

    const retries = Math.max(
      0,
      Number(opts?.retries ?? process.env.AI_RETRIES ?? 1),
    );
    const timeoutMs = Number(opts?.timeoutMs ?? this.DEFAULT_TIMEOUT_MS);

    const headersBase = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    const normalizeModel = (m: string) => {
      return String(m ?? '')
        .trim()
        .toLowerCase();
    };

    const buildChatBody = (
      userContent: string,
      meta?: any,
      forceNoTemperature = false,
    ) => {
      const m = normalizeModel(model);

      const body: any = {
        model,
        messages: [
          {
            role: 'system',
            content:
              'Você é rigoroso. Responda ESTRITAMENTE um ÚNICO JSON válido UTF-8. Não use markdown, não explique, não adicione texto fora do JSON.',
          },
          ...(meta
            ? [
                {
                  role: 'system',
                  content: `Meta de chunk: ${JSON.stringify(meta)}`,
                },
              ]
            : []),
          ...(immutableBlocks.length
            ? [
                {
                  role: 'system',
                  content:
                    'Há trechos imutáveis representados por tokens do tipo __IMMUTABLE_BLOCK_N__. Você DEVE preservar esses tokens exatamente (não remover, não alterar, não renomear).',
                },
              ]
            : []),
          { role: 'user', content: userContent },
        ],
        // ✅ default: json_object
        response_format: { type: 'json_object' as const },
      };

      // ✅ Só tenta setar temperature se NÃO for forçado a remover
      // (e se você quiser manter o "default 0" quando suportado)
      if (!forceNoTemperature && !m.startsWith('gpt-5')) {
        body.temperature = opts?.temperature ?? 0;
      }

      // ✅ Se fornecido jsonSchema, usa Structured Outputs (strict mode)
      if (opts?.jsonSchema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: opts.jsonSchema.name,
            schema: opts.jsonSchema.schema,
            strict: opts.jsonSchema.strict ?? true,
          },
        };
      }

      // ✅ Fix crítico: só enviar max tokens se for > 0
      const rawMax = opts?.maxTokens ?? process.env.AI_MAX_TOKENS;
      const max = Number(rawMax);

      if (Number.isFinite(max) && max > 0) {
        if (this.requiresMaxCompletionTokens(model)) {
          body.max_completion_tokens = max;
        } else {
          body.max_tokens = max;
        }
      }
      return body;
    };

    const runSingle = async (
      userContent: string,
      meta?: { chunkIndex?: number; totalChunks?: number },
    ) => {
      // Arquivo ÚNICO por chamada (payload + retorno)
      const ioAudit = await this.startAuditFile(
        'chat.completions',
        model,
        buildChatBody(userContent, meta, false),
      ).catch((err) => {
        this.logger.error(
          `[AUDITORIA] Falha ao iniciar arquivo de IO: ${err?.message || err}`,
        );
        return { filePath: '', append: async () => void 0 };
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const doOnce = async (_attempt: number) => {
        // debug removido para evitar ruído em produção
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          let forceNoTemperature = false;

          for (let inner = 0; inner < 2; inner++) {
            const chatBody = buildChatBody(
              userContent,
              meta,
              forceNoTemperature,
            );

            const chat = await fetch(
              'https://api.openai.com/v1/chat/completions',
              {
                method: 'POST',
                headers: headersBase,
                body: JSON.stringify(chatBody),
                signal: ctrl.signal,
              },
            );
            const reqId = chat.headers.get('x-request-id') || undefined;
            this.logger.log(
              `[chat.completions] model=${model} HTTP ${chat.status} ${chat.statusText} reqId=${reqId ?? '-'}`,
            );

            if (!chat.ok) {
              const raw = await chat.text().catch(() => '(sem corpo)');
              let errObj: any = null;
              try {
                errObj = JSON.parse(raw);
              } catch {}

              // ✅ fallback: se temperature foi rejeitado, tenta mais 1x sem enviar temperature
              if (
                !forceNoTemperature &&
                errObj?.error?.param === 'temperature' &&
                errObj?.error?.code === 'unsupported_value'
              ) {
                forceNoTemperature = true;
                continue;
              }

              const preview = raw.slice(0, this.RAW_PREVIEW_LIMIT);
              this.logger.error(`[chat.completions] body: ${preview}`);
              // Em erro HTTP, não criamos novos arquivos nem subpastas; mantemos só o payload já gravado.
              // (Opcional) poderíamos anexar o corpo bruto aqui, mas para seguir "payload + retorno",
              // apenas retornos bem-sucedidos/parseáveis são anexados.
              const msg = `chat.completions falhou: ${chat.status} ${chat.statusText}`;
              const err = new Error(msg) as any;
              err.status = chat.status;
              err.requestId = reqId;
              err.bodyPreview = preview;
              throw err;
            }

            const data = (await chat.json()) as any;

            // ✅ Registro de uso de IA
            const usage = data?.usage ?? {};
            const promptTokens = usage?.prompt_tokens;
            const completionTokens = usage?.completion_tokens;
            const totalTokens = usage?.total_tokens;
            const cachedTokens =
              usage?.prompt_tokens_details?.cached_tokens ??
              usage?.cached_tokens ??
              0;

            try {
              await this.aiUsage.record({
                kind: 'chat.completions',
                model,
                userId: opts?.userId,
                userName: opts?.userName,
                requestId: reqId ?? data?.id,
                callName: opts?.callName,
                promptTokens,
                completionTokens,
                cachedTokens,
                totalTokens,
              });
            } catch (e: any) {
              this.logger.error(
                `[AI_USAGE] Falha ao gravar uso: ${e?.message || e}`,
              );
            }

            // ✅ Extração mais robusta do texto (caso venha formato diferente)
            const msg = data?.choices?.[0]?.message;
            let text = msg?.content ?? '';

            // Se content for array (formato alternativo)
            if (Array.isArray(text)) {
              text = text.map((p: any) => p?.text ?? p?.value ?? '').join('');
            }

            text =
              text ||
              data?.output_text ||
              data?.output?.[0]?.content?.[0]?.text ||
              '';

            // ✅ Tratar explicitamente "saída vazia" antes de parsear
            const cleaned = String(text ?? '');
            if (!cleaned.trim()) {
              // ✅ Log de auditoria: anexa o JSON bruto quando der vazio
              try {
                await ioAudit.append(
                  'RAW_RESPONSE_JSON: ' +
                    JSON.stringify(data, null, 2) +
                    '\n\n',
                );
              } catch (e: any) {
                this.logger.error(
                  `[AUDITORIA] Falha ao anexar JSON bruto: ${e?.message || e}`,
                );
              }

              const e = new Error('EMPTY_MODEL_OUTPUT') as any;
              e.code = 'EMPTY_MODEL_OUTPUT';
              e.finishReason = data?.choices?.[0]?.finish_reason;
              e.requestId = data?.id || undefined;
              throw e;
            }

            // Anexa o RETORNO bruto (conteúdo textual da IA) no mesmo .txt
            try {
              await ioAudit.append('Retorno: ' + String(text) + '\n\n');
            } catch (e: any) {
              this.logger.error(
                `[AUDITORIA] Falha ao anexar retorno ao arquivo: ${e?.message || e}`,
              );
            }
            try {
              const parsed = this.safeParseJson(text);
              return immutableBlocks.length
                ? this.deepRestoreNonPlaceholderDoubleBrackets(
                    parsed,
                    immutableBlocks,
                  )
                : parsed;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (_parseErr: any) {
              // ✅ Log de auditoria: anexa o JSON bruto quando der parse error
              try {
                await ioAudit.append(
                  'RAW_RESPONSE_JSON: ' +
                    JSON.stringify(data, null, 2) +
                    '\n\n',
                );
              } catch (e: any) {
                this.logger.error(
                  `[AUDITORIA] Falha ao anexar JSON bruto: ${e?.message || e}`,
                );
              }

              // Loga um preview do texto cru para entender onde quebrou
              const preview = String(text).slice(0, this.RAW_PREVIEW_LIMIT);
              this.logger.error(
                `[chat.completions] JSON parse error. raw preview:\n${preview}`,
              );
              // Garantimos que o arquivo tenha o retorno bruto; já foi anexado acima.
              const e = new Error(`JSON inválido retornado pelo modelo`) as any;
              e.code = 'JSON_PARSE_ERROR';
              e.requestId = data?.id || undefined;
              e.rawPreview = preview;
              throw e;
            }
          }

          // se cair aqui, algo estranho aconteceu
          throw new Error(
            'Falha inesperada ao aplicar fallback de temperature',
          );
        } finally {
          clearTimeout(to);
        }
      };

      // Retries leves com backoff
      let lastErr: unknown;
      for (let i = 0; i <= retries; i++) {
        try {
          return await doOnce(i + 1);
        } catch (e) {
          // Traduz AbortError para TIMEOUT explícito
          if (
            (e as any)?.name === 'AbortError' ||
            String((e as any)?.message).includes('aborted')
          ) {
            const err = new Error(
              `AI_REQUEST_TIMEOUT after ${timeoutMs} ms`,
            ) as any;
            err.code = 'AI_TIMEOUT';
            lastErr = err;
          } else {
            lastErr = e;
          }
          if (i < retries) {
            const backoff = 300 * (i + 1);
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      }

      // Propaga metadados úteis
      const msg = (lastErr as any)?.message ?? 'Erro desconhecido na IA';
      const status = (lastErr as any)?.status;
      const requestId = (lastErr as any)?.requestId;
      const bodyPreview =
        (lastErr as any)?.bodyPreview ?? (lastErr as any)?.rawPreview;
      const code = (lastErr as any)?.code;
      const composed =
        `${code ? `[${code}] ` : ''}${msg}` +
        `${status ? ` (status ${status})` : ''}` +
        `${requestId ? ` [reqId=${requestId}]` : ''}` +
        `${bodyPreview ? ` :: ${String(bodyPreview).slice(0, this.RAW_PREVIEW_LIMIT)}` : ''}`;
      throw new InternalServerErrorException(composed);
    };

    // ===== Sem chunking =====
    if (chunks.length === 1) {
      return runSingle(chunks[0]);
    }

    // ===== Com chunking =====
    let acc: any = {};
    const total = chunks.length;
    for (let i = 0; i < total; i++) {
      const header =
        `Este é o chunk ${i + 1} de ${total} de um prompt maior. ` +
        `Extraia/retorne SOMENTE informações suportadas por este trecho. ` +
        `Se precisar completar o JSON final, não invente fatos ausentes.`;
      const chunkPrompt = `${header}\n\n${chunks[i]}`;
      const part = await runSingle(chunkPrompt, {
        chunkIndex: i,
        totalChunks: total,
      });
      acc = this.deepMergeLoose(acc, part);
    }
    return acc;
  }

  /**
   * Envia um prompt e obriga retorno em TEXTO puro.
   * Útil quando o modelo deve editar/revisar conteúdo sem JSON-AST.
   *
   * Observação:
   * - Não há response_format para texto; então reforçamos via instrução de system.
   * - Chunking pode ser por "chars" ou "lines".
   */
  async generateStrictText(
    prompt: string,
    model = process.env.AI_CHECKLIST_MODEL || 'gpt-4o-mini',
    opts?: {
      maxTokens?: number;
      timeoutMs?: number;
      retries?: number;
      chunkMode?: 'chars' | 'lines';
      /**
       * ✅ NOVO: preserva blocos [[...]] de texto livre (não-placeholder).
       */
      preserveNonPlaceholderDoubleBrackets?: boolean;
      /**
       * ID do usuário que está fazendo a requisição (opcional).
       * Se não fornecido, o registro de uso não incluirá userId.
       */
      userId?: string;
      /**
       * Nome do usuário que está fazendo a requisição (opcional).
       * Se não fornecido, o registro de uso não incluirá userName.
       */
      userName?: string;
      /**
       * Nome da chamada (opcional) para rastrear origem no uso.
       */
      callName?: string;
    },
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
      throw new InternalServerErrorException(
        'OPENAI_API_KEY não configurada no ambiente',
      );

    const PROMPT_HARD_LIMIT = Number(
      process.env.AI_PROMPT_CHAR_LIMIT ?? 120_000,
    );

    const chunking = this.isChunkingEnabled();
    const mode = opts?.chunkMode ?? 'chars';
    const rawPrompt = String(prompt || '');
    const protectedPromptPack = opts?.preserveNonPlaceholderDoubleBrackets
      ? this.protectNonPlaceholderDoubleBrackets(rawPrompt)
      : { text: rawPrompt, blocks: [] as ImmutableBracketBlock[] };
    const immutableBlocks = protectedPromptPack.blocks ?? [];
    const effectivePrompt = protectedPromptPack.text;
    // Quando chunkMode === "lines", o texto é fatiado respeitando quebras "\n",
    // atendendo ao requisito de "blocos por linhas" quando o prompt ultrapassa AI_PROMPT_CHAR_LIMIT.
    const chunks =
      chunking && effectivePrompt.length > PROMPT_HARD_LIMIT
        ? mode === 'lines'
          ? this.chunkTextByLines(effectivePrompt, PROMPT_HARD_LIMIT)
          : this.chunkString(effectivePrompt, PROMPT_HARD_LIMIT)
        : [effectivePrompt];

    const retries = Math.max(
      0,
      Number(opts?.retries ?? process.env.AI_RETRIES ?? 1),
    );
    const timeoutMs = Number(opts?.timeoutMs ?? this.DEFAULT_TIMEOUT_MS);

    const headersBase = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    const buildChatBody = (userContent: string, meta?: any) => {
      const body: any = {
        model,
        messages: [
          {
            role: 'system',
            content:
              'Você é rigoroso. Responda ESTRITAMENTE APENAS com TEXTO UTF-8. Não use markdown, não explique, não adicione rótulos, não inclua JSON.',
          },
          ...(meta
            ? [
                {
                  role: 'system',
                  content: `Meta de chunk: ${JSON.stringify(meta)}`,
                },
              ]
            : []),
          ...(immutableBlocks.length
            ? [
                {
                  role: 'system',
                  content:
                    'Há trechos imutáveis representados por tokens do tipo __IMMUTABLE_BLOCK_N__. Você DEVE preservar esses tokens exatamente (não remover, não alterar, não renomear).',
                },
              ]
            : []),
          { role: 'user', content: userContent },
        ],
      };
      // ✅ Fix crítico: só enviar max tokens se for > 0
      const rawMax = opts?.maxTokens ?? process.env.AI_MAX_TOKENS;
      const max = Number(rawMax);

      if (Number.isFinite(max) && max > 0) {
        if (this.requiresMaxCompletionTokens(model)) {
          body.max_completion_tokens = max;
        } else {
          body.max_tokens = max;
        }
      }
      return body;
    };

    const runSingle = async (
      userContent: string,
      meta?: { chunkIndex?: number; totalChunks?: number },
    ) => {
      const chatBody = buildChatBody(userContent, meta);

      const ioAudit = await this.startAuditFile(
        'chat.completions.text',
        model,
        chatBody,
      ).catch((err) => {
        this.logger.error(
          `[AUDITORIA] Falha ao iniciar arquivo de IO: ${err?.message || err}`,
        );
        return { filePath: '', append: async () => void 0 };
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const doOnce = async (_attempt: number) => {
        // debug removido para evitar ruído em produção
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const chat = await fetch(
            'https://api.openai.com/v1/chat/completions',
            {
              method: 'POST',
              headers: headersBase,
              body: JSON.stringify(chatBody),
              signal: ctrl.signal,
            },
          );
          const reqId = chat.headers.get('x-request-id') || undefined;
          this.logger.log(
            `[chat.completions.text] HTTP ${chat.status} ${chat.statusText} reqId=${reqId ?? '-'}`,
          );
          if (!chat.ok) {
            const t = await chat.text().catch(() => '(sem corpo)');
            const preview = t.slice(0, this.RAW_PREVIEW_LIMIT);
            this.logger.error(`[chat.completions.text] body: ${preview}`);
            const msg = `chat.completions falhou: ${chat.status} ${chat.statusText}`;
            const err = new Error(msg) as any;
            err.status = chat.status;
            err.requestId = reqId;
            err.bodyPreview = preview;
            throw err;
          }
          const data = (await chat.json()) as any;

          // ✅ Registro de uso de IA
          const usage = data?.usage ?? {};
          const promptTokens = usage?.prompt_tokens;
          const completionTokens = usage?.completion_tokens;
          const totalTokens = usage?.total_tokens;
          const cachedTokens =
            usage?.prompt_tokens_details?.cached_tokens ??
            usage?.cached_tokens ??
            0;

          try {
            await this.aiUsage.record({
              kind: 'chat.completions.text',
              model,
              userId: opts?.userId,
              userName: opts?.userName,
              requestId: reqId ?? data?.id,
              callName: opts?.callName,
              promptTokens,
              completionTokens,
              cachedTokens,
              totalTokens,
            });
          } catch (e: any) {
            this.logger.error(
              `[AI_USAGE] Falha ao gravar uso: ${e?.message || e}`,
            );
          }

          // ✅ Extração mais robusta do texto (caso venha formato diferente)
          const msg = data?.choices?.[0]?.message;
          let text = msg?.content ?? '';

          // Se content for array (formato alternativo)
          if (Array.isArray(text)) {
            text = text.map((p: any) => p?.text ?? p?.value ?? '').join('');
          }

          text =
            text ||
            data?.output_text ||
            data?.output?.[0]?.content?.[0]?.text ||
            '';

          // ✅ Tratar explicitamente "saída vazia"
          const cleaned = String(text ?? '');
          if (!cleaned.trim()) {
            // ✅ Log de auditoria: anexa o JSON bruto quando der vazio
            try {
              await ioAudit.append(
                'RAW_RESPONSE_JSON: ' + JSON.stringify(data, null, 2) + '\n\n',
              );
            } catch (e: any) {
              this.logger.error(
                `[AUDITORIA] Falha ao anexar JSON bruto: ${e?.message || e}`,
              );
            }

            const e = new Error('EMPTY_MODEL_OUTPUT') as any;
            e.code = 'EMPTY_MODEL_OUTPUT';
            e.finishReason = data?.choices?.[0]?.finish_reason;
            e.requestId = data?.id || undefined;
            throw e;
          }

          try {
            await ioAudit.append(String(text) + '\n');
          } catch (e: any) {
            this.logger.error(
              `[AUDITORIA] Falha ao anexar retorno ao arquivo: ${e?.message || e}`,
            );
          }

          const out = String(text ?? '').trim();
          return immutableBlocks.length
            ? this.restoreNonPlaceholderDoubleBrackets(out, immutableBlocks)
            : out;
        } finally {
          clearTimeout(to);
        }
      };

      let lastErr: unknown;
      for (let i = 0; i <= retries; i++) {
        try {
          return await doOnce(i + 1);
        } catch (e) {
          if (
            (e as any)?.name === 'AbortError' ||
            String((e as any)?.message).includes('aborted')
          ) {
            const err = new Error(
              `AI_REQUEST_TIMEOUT after ${timeoutMs} ms`,
            ) as any;
            err.code = 'AI_TIMEOUT';
            lastErr = err;
          } else {
            lastErr = e;
          }
          if (i < retries) {
            const backoff = 300 * (i + 1);
            await new Promise((r) => setTimeout(r, backoff));
          }
        }
      }

      const msg = (lastErr as any)?.message ?? 'Erro desconhecido na IA';
      const status = (lastErr as any)?.status;
      const requestId = (lastErr as any)?.requestId;
      const bodyPreview =
        (lastErr as any)?.bodyPreview ?? (lastErr as any)?.rawPreview;
      const code = (lastErr as any)?.code;
      const composed =
        `${code ? `[${code}] ` : ''}${msg}` +
        `${status ? ` (status ${status})` : ''}` +
        `${requestId ? ` [reqId=${requestId}]` : ''}` +
        `${bodyPreview ? ` :: ${String(bodyPreview).slice(0, this.RAW_PREVIEW_LIMIT)}` : ''}`;
      throw new InternalServerErrorException(composed);
    };

    if (chunks.length === 1) {
      return runSingle(chunks[0]);
    }

    const total = chunks.length;
    const parts: string[] = [];
    for (let i = 0; i < total; i++) {
      const header =
        `Este é o chunk ${i + 1} de ${total} de um texto maior.\n` +
        `Responda APENAS com o texto correspondente a este trecho,\n` +
        `sem repetir outros chunks, sem explicações.`;
      const chunkPrompt = `${header}\n\n${chunks[i]}`;
      const part = await runSingle(chunkPrompt, {
        chunkIndex: i,
        totalChunks: total,
      });
      if (part) parts.push(part);
    }
    return parts.join('\n').trim();
  }

  // ===================== NOVO: Embeddings =====================
  /**
   * Gera embedding (vetor) para um texto.
   * Usa OpenAI Embeddings API.
   *
   * Requer:
   * - OPENAI_API_KEY
   *
   * Env recomendadas:
   * - AI_EMBEDDING_MODEL=text-embedding-3-small (1536 dims)
   */
  async generateEmbedding(
    input: string,
    opts?: EmbeddingOptions,
  ): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'OPENAI_API_KEY não configurada no ambiente',
      );
    }

    const model =
      opts?.model ?? process.env.AI_EMBEDDING_MODEL ?? 'text-embedding-3-small';

    const timeoutMs = Number(opts?.timeoutMs ?? this.DEFAULT_TIMEOUT_MS);
    const retries = Math.max(
      0,
      Number(opts?.retries ?? process.env.AI_RETRIES ?? 1),
    );

    const headersBase = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    const payload = {
      model,
      input: String(input ?? ''),
    };

    const ioAudit = await this.startAuditFile(
      'embeddings',
      model,
      payload,
    ).catch((err) => {
      this.logger.error(
        `[AUDITORIA] Falha ao iniciar arquivo de IO (embeddings): ${err?.message || err}`,
      );
      return { filePath: '', append: async () => void 0 };
    });

    const doOnce = async () => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: headersBase,
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });

        const reqId = res.headers.get('x-request-id') || undefined;
        this.logger.log(
          `[embeddings] model=${model} HTTP ${res.status} ${res.statusText} reqId=${reqId ?? '-'}`,
        );

        if (!res.ok) {
          const raw = await res.text().catch(() => '(sem corpo)');
          const preview = raw.slice(0, this.RAW_PREVIEW_LIMIT);
          this.logger.error(`[embeddings] body: ${preview}`);
          const err = new Error(
            `embeddings falhou: ${res.status} ${res.statusText}`,
          ) as any;
          err.status = res.status;
          err.requestId = reqId;
          err.bodyPreview = preview;
          throw err;
        }

        const data = (await res.json()) as any;

        // auditoria: anexa retorno bruto
        try {
          await ioAudit.append('Retorno: ' + JSON.stringify(data) + '\n\n');
        } catch (e: any) {
          this.logger.error(
            `[AUDITORIA] Falha ao anexar retorno embeddings: ${e?.message || e}`,
          );
        }

        const emb = data?.data?.[0]?.embedding;
        if (!Array.isArray(emb) || emb.length === 0) {
          const e = new Error('EMPTY_EMBEDDING_OUTPUT') as any;
          e.code = 'EMPTY_EMBEDDING_OUTPUT';
          e.requestId = reqId ?? data?.id;
          throw e;
        }

        // ✅ registro de uso (tokens de embedding vêm em usage.total_tokens normalmente)
        const usage = data?.usage ?? {};
        const totalTokens = usage?.total_tokens;
        try {
          await this.aiUsage.record({
            kind: 'embeddings',
            model,
            userId: opts?.userId,
            userName: opts?.userName,
            requestId: reqId ?? data?.id,
            callName: opts?.callName,
            promptTokens: totalTokens,
            totalTokens,
          });
        } catch (e: any) {
          this.logger.error(
            `[AI_USAGE] Falha ao gravar uso (embeddings): ${e?.message || e}`,
          );
        }

        return emb as number[];
      } finally {
        clearTimeout(to);
      }
    };

    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        return await doOnce();
      } catch (e) {
        if (
          (e as any)?.name === 'AbortError' ||
          String((e as any)?.message).includes('aborted')
        ) {
          const err = new Error(
            `AI_REQUEST_TIMEOUT after ${timeoutMs} ms`,
          ) as any;
          err.code = 'AI_TIMEOUT';
          lastErr = err;
        } else {
          lastErr = e;
        }
        if (i < retries) {
          const backoff = 250 * (i + 1);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    const msg =
      (lastErr as any)?.message ?? 'Erro desconhecido ao gerar embedding';
    const status = (lastErr as any)?.status;
    const requestId = (lastErr as any)?.requestId;
    const bodyPreview = (lastErr as any)?.bodyPreview;
    const code = (lastErr as any)?.code;
    const composed =
      `${code ? `[${code}] ` : ''}${msg}` +
      `${status ? ` (status ${status})` : ''}` +
      `${requestId ? ` [reqId=${requestId}]` : ''}` +
      `${bodyPreview ? ` :: ${String(bodyPreview).slice(0, this.RAW_PREVIEW_LIMIT)}` : ''}`;
    throw new InternalServerErrorException(composed);
  }

  // ===================== NOVO: Pipeline de transformações de TEXTO =====================
  /**
   * Executa uma cadeia sequencial de transformações de texto usando LLMs.
   *
   * Motivação:
   * - Permitir fluxos com "pré-LLM" (ex.: remoção de tópicos específicos)
   *   antes de uma "LLM principal" (ex.: injeção/normalização de placeholders),
   *   sem acoplar heurísticas determinísticas ao domínio.
   *
   * Como funciona:
   * - Recebe um texto de entrada.
   * - Para cada step:
   *   - Monta o prompt a partir de um promptTemplate
   *     que pode usar {{INPUT_TEXT}} e {{CURRENT_TEXT}}.
   *   - Chama generateStrictText e usa a saída como CURRENT_TEXT do próximo step.
   *
   * Observação:
   * - Cada step gera sua própria auditoria via generateStrictText.
   * - Não altera comportamento de chamadas existentes.
   */
  async runTextTransformChain(
    inputText: string,
    steps: TextTransformStep[],
    defaults?: { model?: string; opts?: StrictTextOptions },
  ): Promise<string> {
    const original = String(inputText ?? '');
    if (!Array.isArray(steps) || steps.length === 0) {
      return original.trim();
    }

    let current = original;
    const total = steps.length;

    for (let i = 0; i < total; i++) {
      const step = steps[i];
      const tpl = String(step?.promptTemplate ?? '').trim();
      if (!tpl.length) continue;

      const prompt = this.applyPromptTemplate(tpl, {
        INPUT_TEXT: original,
        CURRENT_TEXT: current,
        STEP_INDEX: String(i),
        STEP_NUMBER: String(i + 1),
        TOTAL_STEPS: String(total),
      });

      const model = step.model ?? defaults?.model;
      const mergedOpts: StrictTextOptions = {
        ...(defaults?.opts ?? {}),
        ...(step.opts ?? {}),
      };

      current = await this.generateStrictText(prompt, model, mergedOpts as any);
    }

    return String(current ?? '').trim();
  }

  /**
   * Atalho comum para 2 passes de TEXTO:
   * 1) preprocessamento (ex.: "remova tópicos específicos")
   * 2) transformação principal (ex.: "insira/ajuste placeholders")
   *
   * Os dois prompts devem ser templates e podem usar:
   * - {{INPUT_TEXT}}
   * - {{CURRENT_TEXT}}
   */
  async twoPassStrictText(
    inputText: string,
    preprocessPromptTemplate: string,
    mainPromptTemplate: string,
    cfg?: {
      preprocessModel?: string;
      mainModel?: string;
      preprocessOpts?: StrictTextOptions;
      mainOpts?: StrictTextOptions;
      defaults?: { model?: string; opts?: StrictTextOptions };
    },
  ): Promise<string> {
    const preModel =
      cfg?.preprocessModel ??
      process.env.AI_PREPROCESS_MODEL ??
      process.env.AI_CHECKLIST_MODEL ??
      'gpt-4o-mini';

    const mainModel =
      cfg?.mainModel ??
      process.env.AI_MAIN_TEXT_MODEL ??
      process.env.AI_CHECKLIST_MODEL ??
      'gpt-4o';

    return this.runTextTransformChain(
      inputText,
      [
        {
          promptTemplate: preprocessPromptTemplate,
          model: preModel,
          opts: cfg?.preprocessOpts,
        },
        {
          promptTemplate: mainPromptTemplate,
          model: mainModel,
          opts: cfg?.mainOpts,
        },
      ],
      cfg?.defaults,
    );
  }

  private safeParseJson(s: string) {
    const trimmed = (s || '').trim();
    // Remove trechos acidentais fora de { ... }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      return JSON.parse(slice);
    }
    return JSON.parse(trimmed);
  }

  // ===================== AssemblyAI (transcrição com diarização) =====================

  private msToHms(ms: number): string {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((n) => n.toString().padStart(2, '0')).join(':');
  }

  /**
   * Transcrição via AssemblyAI (com diarização).
   * Requer ASSEMBLYAI_API_KEY no ambiente.
   * Registra uso em ai_usage com model 'assemblyai-transcribe'.
   */
  async transcribeWithAssemblyAI(
    buffer: Buffer,
    _mimeType: string | undefined,
    fileName: string,
    opts?: {
      userId?: string;
      requestId?: string;
      callName?: string;
    },
  ): Promise<{
    segments: TranscriptionSegmentLike[];
    durationSeconds: number;
    model: string;
  }> {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'ASSEMBLYAI_API_KEY não configurada no ambiente',
      );
    }

    const client = new AssemblyAI({ apiKey });

    const tempDir = path.join(
      os.tmpdir(),
      `assemblyai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    );
    await fs.mkdir(tempDir, { recursive: true });
    const ext = path.extname(fileName) || '.m4a';
    const tempPath = path.join(tempDir, `audio${ext}`);

    try {
      await fs.writeFile(tempPath, buffer);

      const transcript = await client.transcripts.transcribe({
        audio: tempPath,
        language_detection: true,
        speaker_labels: true,
        speech_models: ['universal-3-pro', 'universal-2'],
      });

      if (transcript.status === 'error') {
        const msg = (transcript as any).error ?? 'Transcrição falhou';
        this.logger.warn(`[AssemblyAI] status=error: ${msg}`);
        throw new InternalServerErrorException(`AssemblyAI: ${String(msg)}`);
      }

      const utterances = (transcript as any).utterances ?? [];
      const audioDurationMs =
        typeof (transcript as any).audio_duration === 'number'
          ? (transcript as any).audio_duration * 1000
          : 0;
      const durationSeconds = Math.round(
        audioDurationMs > 0 ? audioDurationMs / 1000 : 0,
      );

      const segments: TranscriptionSegmentLike[] = utterances.map(
        (u: any, i: number) => ({
          id: String(i),
          startTime: this.msToHms(u.start ?? 0),
          endTime: this.msToHms(u.end ?? u.start ?? 0),
          text: (u.text ?? '').trim(),
          ...(u.speaker != null && u.speaker !== ''
            ? { speaker: `Speaker ${u.speaker}` }
            : {}),
        }),
      );

      // Se não houver utterances mas houver texto, cria um único segmento
      const text = (transcript as any).text;
      if (segments.length === 0 && text && String(text).trim()) {
        segments.push({
          id: '0',
          startTime: '00:00:00',
          endTime: this.msToHms(audioDurationMs || 0),
          text: String(text).trim(),
        });
      }

      const effectiveDuration =
        durationSeconds > 0
          ? durationSeconds
          : segments.length
            ? Math.max(
                ...segments.map((s) => {
                  const [h, m, sec] = (s.endTime ?? s.startTime)
                    .split(':')
                    .map(Number);
                  return (h || 0) * 3600 + (m || 0) * 60 + (sec || 0);
                }),
              )
            : 0;

      try {
        await this.aiUsage.record({
          kind: 'transcription',
          model: 'assemblyai-transcribe',
          userId: opts?.userId,
          requestId: opts?.requestId,
          callName: opts?.callName ?? 'transcriptions.create',
          promptTokens: effectiveDuration,
        });
      } catch (e: any) {
        this.logger.error(
          `[AI_USAGE] Falha ao gravar uso AssemblyAI: ${e?.message || e}`,
        );
      }

      this.logger.log(
        `[AssemblyAI] Transcrição concluída: ${segments.length} segmentos`,
      );

      return {
        segments,
        durationSeconds: effectiveDuration,
        model: 'assemblyai-transcribe',
      };
    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}
