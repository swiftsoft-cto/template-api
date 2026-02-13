import { z } from 'zod';

export const AiUsageRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1), // ex: "chat.completions" | "chat.completions.text"
  model: z.string().min(1),
  userId: z.string().optional(),
  userName: z.string().optional(),
  requestId: z.string().optional(),
  callName: z.string().optional(),

  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  cachedTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),

  createdAt: z.string().min(1),
});

export type AiUsageRecord = z.infer<typeof AiUsageRecordSchema>;

export const ListAiUsageQuerySchema = z.object({
  model: z.string().optional(),
  userId: z.string().optional(),
  kind: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  from: z.string().optional(), // ISO
  to: z.string().optional(), // ISO
  order: z.enum(['asc', 'desc']).optional(),
});

export type ListAiUsageQuery = z.infer<typeof ListAiUsageQuerySchema>;
export class ListAiUsageQueryDto {
  static schema = ListAiUsageQuerySchema;
}

export const SummaryAiUsageQuerySchema = z.object({
  model: z.string().optional(),
  userId: z.string().optional(),
  kind: z.string().optional(),
  topUsers: z.coerce.number().int().min(1).max(50).optional(),
  topModels: z.coerce.number().int().min(1).max(50).optional(),
});

export type SummaryAiUsageQuery = z.infer<typeof SummaryAiUsageQuerySchema>;
export class SummaryAiUsageQueryDto {
  static schema = SummaryAiUsageQuerySchema;
}

export interface AiUsageAgg {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd?: number; // Custo total em dólares
  updatedAt: string;
}

export interface AiUsageRecordWithCost extends AiUsageRecord {
  costUsd?: number; // Custo em dólares para este registro
}

export interface AiUsageListResponse {
  total: number;
  limit: number;
  offset: number;
  order: 'asc' | 'desc';
  totalCostUsd: number; // Custo total em dólares dos registros retornados
  calls: number; // Total de chamadas dentro do filtro (ignora paginação)
  promptTokens: number; // Soma de prompt tokens considerando todos os registros filtrados
  completionTokens: number; // Soma de completion tokens considerando todos os registros filtrados
  cachedTokens: number; // Soma de tokens cacheados considerando todos os registros filtrados
  totalTokens: number; // Soma de tokens totais considerando todos os registros filtrados
  costUsd: number; // Alias para totalCostUsd para compatibilidade com consumidores
  items: AiUsageRecordWithCost[];
}
