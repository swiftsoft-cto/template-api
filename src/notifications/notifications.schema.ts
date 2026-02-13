import { z } from 'zod';

// Schema para criação de notificação
export const createNotificationSchema = z.object({
  userId: z.string().uuid({ message: 'validation.userId.required' }),
  title: z
    .string({ required_error: 'validation.title.required' })
    .min(1, { message: 'validation.title.required' }),
  message: z
    .string({ required_error: 'validation.message.required' })
    .min(1, { message: 'validation.message.required' }),
  entity: z
    .string({ required_error: 'validation.entity.required' })
    .min(1, { message: 'validation.entity.required' })
    .optional()
    .nullable(),
  registerId: z
    .string()
    .uuid({ message: 'validation.registerId.invalid_uuid' })
    .optional()
    .nullable(),
});

// Schema para atualização de notificação
export const updateNotificationSchema = z.object({
  read: z.boolean().optional(),
});

// Schema para parâmetros de paginação e filtros
export const notificationPaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  read: z
    .preprocess((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return val;
    }, z.boolean().optional())
    .optional(),
  entity: z.string().optional(),
  sortBy: z.enum(['createdAt', 'readAt', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Schema para marcar notificação como lida
export const markAsReadSchema = z.object({
  read: z.boolean().default(true),
});

// Tipos TypeScript derivados dos schemas
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;
export type NotificationPaginationInput = z.infer<
  typeof notificationPaginationSchema
>;
export type MarkAsReadInput = z.infer<typeof markAsReadSchema>;
