import { z } from 'zod';

export const baseDeviceListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const whitelistListSchema = baseDeviceListSchema.extend({
  sortBy: z
    .enum(['createdAt', 'lastSeen', 'userAgent', 'ipSubnet'])
    .default('lastSeen'),
});

export const blacklistListSchema = baseDeviceListSchema.extend({
  sortBy: z.enum(['createdAt', 'userAgent', 'ipSubnet']).default('createdAt'),
});

export type WhitelistListInput = z.infer<typeof whitelistListSchema>;
export type BlacklistListInput = z.infer<typeof blacklistListSchema>;

export class WhitelistListDto implements WhitelistListInput {
  static schema = whitelistListSchema;
  page!: number;
  limit!: number;
  search?: string;
  sortOrder!: 'asc' | 'desc';
  sortBy!: 'createdAt' | 'lastSeen' | 'userAgent' | 'ipSubnet';
}
export class BlacklistListDto implements BlacklistListInput {
  static schema = blacklistListSchema;
  page!: number;
  limit!: number;
  search?: string;
  sortOrder!: 'asc' | 'desc';
  sortBy!: 'createdAt' | 'userAgent' | 'ipSubnet';
}
