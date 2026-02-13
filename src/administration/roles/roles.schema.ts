import { z } from 'zod';

// companyId NÃO vem mais do cliente: será inferido pelo user logado
export const createRoleSchema = z.object({
  name: z.string().min(1, { message: 'validation.name.required' }),
  description: z.string().optional(),
});

// idem para update (não permitir trocar companyId via payload)
export const updateRoleSchema = z.object({
  name: z.string().min(1, { message: 'validation.name.required' }).optional(),
  description: z.string().optional(),
});

// Paginação própria de roles + ordenação
export const rolePaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type RolePaginationInput = z.infer<typeof rolePaginationSchema>;

export class CreateRoleDto {
  static schema = createRoleSchema;
}

export class UpdateRoleDto {
  static schema = updateRoleSchema;
}

export class RolePaginationDto {
  static schema = rolePaginationSchema;
}
