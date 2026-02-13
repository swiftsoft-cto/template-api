import { z } from 'zod';
import { paginationSchema } from '../administration/users/users.schema';

// ---------- CREATE / UPDATE ----------

export const createSensitiveFieldSchema = z.object({
  entity: z.string().min(1),
  field: z.string().min(1),
  moduleName: z.string().optional().nullable(),
  label: z.string().optional(),
  description: z.string().optional(),
  readRule: z.string().optional().nullable(),
  writeRule: z.string().optional().nullable(),
  active: z.boolean().default(true),
  companyId: z.string().uuid().optional().nullable(),
});

export const updateSensitiveFieldSchema = createSensitiveFieldSchema.partial();

export const sfPaginationSchema = paginationSchema.extend({
  entity: z.string().optional(),
  companyId: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

// ---------- MAP QUERIES ----------
export const mapQuerySchema = z.object({
  entity: z.string().min(1),
  companyId: z.string().uuid().optional().nullable(),
});

export class MapQueryDto {
  static schema = mapQuerySchema;
}

// ---------- TYPES ----------

export type CreateSensitiveFieldInput = z.infer<
  typeof createSensitiveFieldSchema
>;
export type UpdateSensitiveFieldInput = z.infer<
  typeof updateSensitiveFieldSchema
>;
export type SFPaginationInput = z.infer<typeof sfPaginationSchema>;

export class CreateSensitiveFieldDto {
  static schema = createSensitiveFieldSchema;
}
export class UpdateSensitiveFieldDto {
  static schema = updateSensitiveFieldSchema;
}
export class SFPaginationDto {
  static schema = sfPaginationSchema;
}
export type MapQuery = z.infer<typeof mapQuerySchema>;
