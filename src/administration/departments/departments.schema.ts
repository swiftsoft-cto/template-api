import { z } from 'zod';

export const createDepartmentSchema = z.object({
  // companyId NÃO vem do cliente: inferido pelo usuário logado
  name: z.string().min(1, { message: 'validation.name.required' }),
  description: z.string().optional(),
  signatureUserId: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().uuid().nullable().optional(),
  ),
});

// idem para update (não permitir trocar companyId via payload)
export const updateDepartmentSchema = z.object({
  name: z.string().min(1, { message: 'validation.name.required' }).optional(),
  description: z.string().optional(),
  signatureUserId: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().uuid().nullable().optional(),
  ),
});

// Paginação própria de departments + ordenação (sem companyId no query)
export const departmentPaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type DepartmentPaginationInput = z.infer<
  typeof departmentPaginationSchema
>;

export class CreateDepartmentDto {
  static schema = createDepartmentSchema;
}
export class UpdateDepartmentDto {
  static schema = updateDepartmentSchema;
}
export class DeptPaginationDto {
  static schema = departmentPaginationSchema;
}
