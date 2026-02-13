import { z } from 'zod';

// ---------------- Templates ----------------
export const CreateContractTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  projectId: z.union([z.string().uuid(), z.null()]).optional(),
  templateHtml: z.string().min(1),
});

export const UpdateContractTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  projectId: z.union([z.string().uuid(), z.null()]).optional(),
  templateHtml: z.string().min(1).optional(),
});

export const ListContractTemplatesSchema = z.object({
  projectId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  orderBy: z.enum(['createdAt', 'updatedAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional(),
});

export type CreateContractTemplateDto = z.infer<
  typeof CreateContractTemplateSchema
>;
export type UpdateContractTemplateDto = z.infer<
  typeof UpdateContractTemplateSchema
>;
export type ListContractTemplatesDto = z.infer<
  typeof ListContractTemplatesSchema
>;

export class CreateContractTemplateBody {
  static schema = CreateContractTemplateSchema;
}
export class UpdateContractTemplateBody {
  static schema = UpdateContractTemplateSchema;
}
export class ListContractTemplatesQuery {
  static schema = ListContractTemplatesSchema;
}

// ---------------- Contracts ----------------
export const CreateContractSchema = z.object({
  projectId: z.union([z.string().uuid(), z.null()]).optional(),
  customerId: z.union([z.string().uuid(), z.null()]).optional(),
  userId: z.union([z.string().uuid(), z.null()]).optional(), // Para contratos de colaborador
  templateId: z.string().uuid(),
  scopeId: z.union([z.string().uuid(), z.null()]).optional(),
  title: z.union([z.string().max(255), z.null()]).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  monthlyValue: z.coerce.number().positive().optional(),
  monthsCount: z.coerce.number().int().positive().optional(),
  firstPaymentDay: z.coerce.number().int().min(1).max(31).optional(),
});

export const UpdateContractSchema = z.object({
  projectId: z.union([z.string().uuid(), z.null()]).optional(),
  customerId: z.union([z.string().uuid(), z.null()]).optional(),
  userId: z.union([z.string().uuid(), z.null()]).optional(), // Para contratos de colaborador
  templateId: z.string().uuid().optional(),
  scopeId: z.string().uuid().nullable().optional(),
  title: z.union([z.string().max(255), z.null()]).optional(),
  status: z.enum(['draft', 'final', 'signed', 'canceled']).optional(),
  isLocked: z.boolean().optional(),
  autentiqueDocumentId: z.string().max(255).nullable().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  contractHtml: z.string().min(1).optional(), // override manual (ex.: CKEditor)
  monthlyValue: z.coerce.number().positive().optional(),
  monthsCount: z.coerce.number().int().positive().optional(),
  firstPaymentDay: z.coerce.number().int().min(1).max(31).optional(),
});

export const ListContractsSchema = z.object({
  projectId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  status: z.enum(['draft', 'final', 'signed', 'canceled']).optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  orderBy: z.enum(['createdAt', 'updatedAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional(),
});

export const PreviewContractSchema = z.object({
  projectId: z.union([z.string().uuid(), z.null()]).optional(),
  customerId: z.union([z.string().uuid(), z.null()]).optional(),
  userId: z.union([z.string().uuid(), z.null()]).optional(), // Para contratos de colaborador
  templateId: z.string().uuid(),
  scopeId: z.union([z.string().uuid(), z.null()]).optional(),
  title: z.union([z.string().max(255), z.null()]).optional(),
  variables: z.record(z.string(), z.string()).optional(),
  monthlyValue: z.coerce.number().positive().optional(),
  monthsCount: z.coerce.number().int().positive().optional(),
  firstPaymentDay: z.coerce.number().int().min(1).max(31).optional(),
});

export type CreateContractDto = z.infer<typeof CreateContractSchema>;
export type UpdateContractDto = z.infer<typeof UpdateContractSchema>;
export type ListContractsDto = z.infer<typeof ListContractsSchema>;
export type PreviewContractDto = z.infer<typeof PreviewContractSchema>;

export class CreateContractBody {
  static schema = CreateContractSchema;
}
export class UpdateContractBody {
  static schema = UpdateContractSchema;
}
export class ListContractsQuery {
  static schema = ListContractsSchema;
}
export class PreviewContractBody {
  static schema = PreviewContractSchema;
}
