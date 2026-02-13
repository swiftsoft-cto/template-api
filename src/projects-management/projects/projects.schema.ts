import { z } from 'zod';
import { ProjectType } from './project.entity';

// Schema para criação de projeto
export const CreateProjectSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  projectCode: z.string().min(1, 'Project code is required'),
  description: z.string().optional().nullable(),
  projectType: z.nativeEnum(ProjectType).default(ProjectType.SOFTWARE),
  customerId: z.string().uuid('Invalid customer ID'),
});

// Schema para atualização de projeto
export const UpdateProjectSchema = z.object({
  projectName: z.string().min(1).optional(),
  projectCode: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  projectType: z.nativeEnum(ProjectType).optional(),
  customerId: z.string().uuid().optional(),
});

// Tipos TypeScript derivados dos schemas
export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;
