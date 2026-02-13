import { z } from 'zod';

const baseListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const blocksListSchema = baseListSchema.extend({
  sortBy: z
    .enum(['blockedAt', 'until', 'email', 'userName'])
    .default('blockedAt'),
});
export type BlocksListInput = z.infer<typeof blocksListSchema>;
export class BlocksListDto implements BlocksListInput {
  static schema = blocksListSchema;
  page!: number;
  limit!: number;
  search?: string;
  sortOrder!: 'asc' | 'desc';
  sortBy!: 'blockedAt' | 'until' | 'email' | 'userName';
}

export const blocksHistoryListSchema = baseListSchema.extend({
  sortBy: z.enum(['createdAt', 'action']).default('createdAt'),
});
export type BlocksHistoryListInput = z.infer<typeof blocksHistoryListSchema>;
export class BlocksHistoryListDto implements BlocksHistoryListInput {
  static schema = blocksHistoryListSchema;
  page!: number;
  limit!: number;
  search?: string;
  sortOrder!: 'asc' | 'desc';
  sortBy!: 'createdAt' | 'action';
}
