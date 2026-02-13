import { z } from 'zod';

export const rulesListSchema = z.object({
  search: z.string().optional(),
  module: z.string().optional(), // opcional: filtra por módulo (ex.: users)
  flat: z.coerce.boolean().default(false), // se true, não agrupa
});

export type RulesListInput = z.infer<typeof rulesListSchema>;

export class RulesListDto implements RulesListInput {
  static schema = rulesListSchema;
  search?: string;
  module?: string;
  flat?: boolean;
}
