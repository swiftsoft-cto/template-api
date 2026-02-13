import { z } from 'zod';

export const ProjectScopeStatusSchema = z.enum([
  'created',
  'in_review',
  'finalized',
]);

// Schema para criação de escopo
export const CreateProjectScopeSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be at most 255 characters'),
  title: z.string().max(255).optional(),
  briefText: z.string().min(1, 'Brief text is required'),
});

// Schema para atualização de escopo
export const UpdateProjectScopeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  title: z.string().max(255).optional(),
  briefText: z.string().min(1).optional(),
  scopeHtml: z.string().optional(),
  status: ProjectScopeStatusSchema.optional(),
});

// Schema para listagem
export const ListProjectScopeSchema = z.object({
  projectId: z.string().uuid().optional(),
  status: ProjectScopeStatusSchema.optional(),
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  orderBy: z.enum(['createdAt', 'updatedAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional(),
});

// Tipos TypeScript derivados dos schemas
export type CreateProjectScopeDto = z.infer<typeof CreateProjectScopeSchema>;
export type UpdateProjectScopeDto = z.infer<typeof UpdateProjectScopeSchema>;
export type ListProjectScopeDto = z.infer<typeof ListProjectScopeSchema>;

// DTOs para classes (usados no controller)
export class CreateProjectScopeBody {
  static schema = CreateProjectScopeSchema;
}

export class UpdateProjectScopeBody {
  static schema = UpdateProjectScopeSchema;
}

export class ListProjectScopeQuery {
  static schema = ListProjectScopeSchema;
}
