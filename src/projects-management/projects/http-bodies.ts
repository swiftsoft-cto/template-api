import { CreateProjectSchema, UpdateProjectSchema } from './projects.schema';

// Classes "holder" para o ZodValidationPipe (usa static schema)
export class CreateProjectBody {
  static schema = CreateProjectSchema;
}

export class UpdateProjectBody {
  static schema = UpdateProjectSchema;
}
