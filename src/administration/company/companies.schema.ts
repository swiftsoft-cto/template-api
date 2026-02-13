import { z } from 'zod';

// Somente atualização; criação/exclusão não existem nesse módulo.
export const updateCompanySchema = z.object({
  name: z.string().min(1, { message: 'validation.name.required' }).optional(),
  tradeName: z.string().optional(),
  signatureUserId: z.preprocess(
    (v) => (v === '' ? null : v),
    z.string().uuid().nullable().optional(),
  ),
  website: z
    .string()
    .url({ message: 'validation.website.invalid_url' })
    .optional(),
  phone: z.preprocess(
    (val) => {
      if (val === '') return null;
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== 'string') return val;
      const digits = val.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 11) return digits;
      return val;
    },
    z
      .string()
      .refine((v) => /^\d{10,11}$/.test(v), {
        message: 'validation.phone.invalid',
      })
      .nullable()
      .optional(),
  ),
  cnpj: z.preprocess(
    (val) => {
      if (val === '') return null;
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== 'string') return val;
      const digits = val.replace(/\D/g, '');
      if (digits.length === 14) return digits;
      return val;
    },
    z
      .string()
      .length(14, { message: 'validation.cnpj.cnpj_length' })
      .nullable()
      .optional(),
  ),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export class UpdateCompanyDto {
  static schema = updateCompanySchema;
}
