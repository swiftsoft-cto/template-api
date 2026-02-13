/**
 * Configuração de preços dos modelos OpenAI (por 1 milhão de tokens)
 *
 * Formato: {
 *   modelName: {
 *     input: preço por 1M tokens de input (prompt não cacheado)
 *     cachedInput: preço por 1M tokens de input cacheado
 *     output: preço por 1M tokens de output (completion)
 *     max: preço máximo por 1M tokens (quando não há distinção input/output)
 *   }
 * }
 */
export interface ModelPricing {
  input: number; // Preço por 1M tokens de input (não cacheado)
  cachedInput?: number; // Preço por 1M tokens de input cacheado (opcional)
  output: number; // Preço por 1M tokens de output
  max?: number; // Preço máximo por 1M tokens (quando não há distinção)
  /** Preço por minuto de áudio (USD). Usado para modelos de transcrição (ex.: whisper-1). */
  inputPerMinute?: number;
}

export const AI_MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': {
    input: 0.15,
    cachedInput: 0.07,
    output: 0.6,
  },
  'gpt-4o': {
    input: 2.5,
    cachedInput: 1.25,
    output: 10.0,
  },
  'gpt-4o-2024-05-13': {
    input: 5.0,
    // cachedInput não disponível para este modelo
    output: 15.0,
    max: 15.0, // Quando max está definido, usa ele para todos os tokens
  },
  'gpt-4.1-nano': {
    input: 0.1,
    cachedInput: 0.03,
    output: 0.4,
  },
  'gpt-4.1': {
    input: 2.0,
    cachedInput: 0.5,
    output: 8.0,
  },
  'gpt-4.1-mini': {
    input: 0.4,
    cachedInput: 0.1,
    output: 1.6,
  },
  'gpt-5.1': {
    input: 1.25,
    cachedInput: 0.13,
    output: 10.0,
  },
  'gpt-5': {
    input: 1.25,
    cachedInput: 0.13,
    output: 10.0,
  },
  'gpt-5-mini': {
    input: 0.25,
    cachedInput: 0.03,
    output: 2.0,
  },
  'gpt-5-nano': {
    input: 0.05,
    cachedInput: 0.01,
    output: 0.4,
  },
  /** Transcrição de áudio: cobrança por minuto de áudio. */
  'whisper-1': {
    input: 0,
    output: 0,
    inputPerMinute: 0.006,
  },
  /** Transcrição (OpenAI): $0.006 / minuto. */
  'gpt-4o-transcribe': {
    input: 0,
    output: 0,
    inputPerMinute: 0.006,
  },
  /** Transcrição com diarização (identificação de falantes): $0.006 / minuto. */
  'gpt-4o-transcribe-diarize': {
    input: 0,
    output: 0,
    inputPerMinute: 0.006,
  },
  /** Transcrição (mini): $0.003 / minuto. */
  'gpt-4o-mini-transcribe': {
    input: 0,
    output: 0,
    inputPerMinute: 0.003,
  },
  /** Transcrição AssemblyAI (com diarização): cobrança por minuto de áudio. */
  'assemblyai-transcribe': {
    input: 0,
    output: 0,
    inputPerMinute: 0.00025, // ~$0.015/hora; ajuste conforme tabela AssemblyAI
  },
};

/**
 * Calcula o custo em dólares baseado nos tokens e modelo
 */
export function calculateModelCost(
  model: string,
  promptTokens: number = 0,
  completionTokens: number = 0,
  cachedTokens: number = 0,
): number {
  const pricing = AI_MODEL_PRICING[model];
  if (!pricing) {
    return 0; // Modelo não encontrado, retorna 0
  }

  // Modelos de áudio (ex.: whisper-1): promptTokens = segundos de áudio, custo por minuto
  if (pricing.inputPerMinute !== undefined) {
    const minutes = (promptTokens ?? 0) / 60;
    return minutes * pricing.inputPerMinute;
  }

  // Se o modelo tem preço max (sem distinção input/output), usa ele
  if (pricing.max !== undefined) {
    const totalTokens = promptTokens + completionTokens;
    return (totalTokens / 1_000_000) * pricing.max;
  }

  // Tokens de input não cacheados
  const inputTokens = Math.max(0, promptTokens - cachedTokens);
  const cachedTokensCount = cachedTokens;

  // Calcula custo de input (tokens não cacheados)
  const inputCost = (inputTokens / 1_000_000) * pricing.input;

  // Calcula custo de tokens cacheados (usa preço específico ou fallback para input)
  const cachedInputPrice = pricing.cachedInput ?? pricing.input;
  const cachedCost = (cachedTokensCount / 1_000_000) * cachedInputPrice;

  // Calcula custo de output
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  return inputCost + cachedCost + outputCost;
}
