import { z } from 'zod';

//
// Schema de criação (todos campos obrigatórios)
//
export const createUserSchema = z.object({
  name: z
    .string({ required_error: 'validation.name.required' })
    .min(1, { message: 'validation.name.required' }),

  email: z
    .string({ required_error: 'validation.email.required' })
    .email({ message: 'validation.email.invalid_email' }),

  password: z
    .string({ required_error: 'validation.password.required' })
    .min(8, { message: 'validation.password.min_length' })
    .refine((val) => /[A-Z]/.test(val), {
      message: 'validation.password.uppercase',
    })
    .refine((val) => /[a-z]/.test(val), {
      message: 'validation.password.lowercase',
    })
    .refine((val) => /[0-9]/.test(val), {
      message: 'validation.password.number',
    })
    .refine((val) => /[^A-Za-z0-9]/.test(val), {
      message: 'validation.password.special',
    }),

  phone: z.preprocess(
    (val) => {
      if (val === '') return null;
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== 'string') return val;
      // Remove tudo exceto dígitos
      const digits = val.replace(/\D/g, '');
      // Valida se tem 10 ou 11 dígitos (com ou sem 9)
      if (digits.length === 10 || digits.length === 11) {
        return digits; // Salva apenas os dígitos no banco
      }
      return val; // retorna original se inválido (será validado depois)
    },
    z
      .string({ required_error: 'validation.phone.required' })
      .refine((val) => /^\d{10,11}$/.test(val), {
        message: 'validation.phone.invalid',
      })
      .nullable(),
  ),

  cpf: z.preprocess(
    (val) => {
      if (val === '') return null;
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== 'string') return val;
      // Remove tudo exceto dígitos
      const digits = val.replace(/\D/g, '');
      // Valida se tem exatamente 11 dígitos
      if (digits.length === 11) {
        return digits; // Salva apenas os dígitos no banco
      }
      return val; // retorna original se inválido (será validado depois)
    },
    z
      .string({ required_error: 'validation.cpf.required' })
      .length(11, { message: 'validation.cpf.cpf_length' })
      .nullable(),
  ),

  birthdate: z.coerce.date({
    invalid_type_error: 'validation.invalid_date',
  }),

  // 👇 NOVO: roleId obrigatório para criar usuário com cargo
  roleId: z.string().uuid({ message: 'validation.roleId.required' }),
});

// Schema de atualização (todos campos opcionais, mas com mesmas mensagens)
export const updateUserSchema = z.object({
  name: z
    .string({ required_error: 'validation.name.required' })
    .min(1, { message: 'validation.name.required' })
    .optional(),

  email: z
    .string({ required_error: 'validation.email.required' })
    .email({ message: 'validation.email.invalid_email' })
    .optional(),

  password: z
    .string({ required_error: 'validation.password.required' })
    .min(8, { message: 'validation.password.min_length' })
    .refine((val) => /[A-Z]/.test(val), {
      message: 'validation.password.uppercase',
    })
    .refine((val) => /[a-z]/.test(val), {
      message: 'validation.password.lowercase',
    })
    .refine((val) => /[0-9]/.test(val), {
      message: 'validation.password.number',
    })
    .refine((val) => /[^A-Za-z0-9]/.test(val), {
      message: 'validation.password.special',
    })
    .optional(),

  phone: z.preprocess(
    (val) => {
      if (val === '') return null;
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== 'string') return val;
      // Remove tudo exceto dígitos
      const digits = val.replace(/\D/g, '');
      // Valida se tem 10 ou 11 dígitos (com ou sem 9)
      if (digits.length === 10 || digits.length === 11) {
        return digits; // Salva apenas os dígitos no banco
      }
      return val; // retorna original se inválido (será validado depois)
    },
    z
      .string()
      .refine((val) => /^\d{10,11}$/.test(val), {
        message: 'validation.phone.invalid',
      })
      .nullable()
      .optional(),
  ),

  cpf: z.preprocess(
    (val) => {
      if (val === '') return null;
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== 'string') return val;
      // Remove tudo exceto dígitos
      const digits = val.replace(/\D/g, '');
      // Valida se tem exatamente 11 dígitos
      if (digits.length === 11) {
        return digits; // Salva apenas os dígitos no banco
      }
      return val; // retorna original se inválido (será validado depois)
    },
    z
      .string()
      .length(11, { message: 'validation.cpf.cpf_length' })
      .nullable()
      .optional(),
  ),

  cnpj: z.preprocess(
    (val) => {
      // '' => null; undefined => undefined (não alterar)
      if (val === '') return null;
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== 'string') return val;
      // Remove tudo exceto dígitos
      const digits = val.replace(/\D/g, '');
      // Valida se tem exatamente 14 dígitos
      if (digits.length === 14) {
        return digits; // Salva apenas os dígitos no banco
      }
      return val; // retorna original se inválido (será validado depois)
    },
    z
      .string()
      .length(14, { message: 'validation.cnpj.cnpj_length' })
      .nullable()
      .optional(),
  ),

  birthdate: z.preprocess(
    (val) => {
      if (val === '') return null;
      if (val === undefined) return undefined;
      if (val === null) return null;
      return val;
    },
    z.union([z.coerce.date(), z.null()]).optional(),
  ),

  postalCode: z.preprocess((val) => {
    // '' => null; undefined => undefined (não alterar)
    if (val === '') return null;
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val !== 'string') return val;
    // Remove tudo exceto dígitos
    const digits = val.replace(/\D/g, '');
    return digits; // Salva apenas os dígitos no banco
  }, z.string().nullable().optional()),

  address: z.preprocess((val) => {
    // '' => null; undefined => undefined (não alterar)
    if (val === '') return null;
    if (val === undefined) return undefined;
    return val;
  }, z.string().nullable().optional()),

  addressState: z.preprocess((val) => {
    // '' => null; undefined => undefined (não alterar)
    if (val === '') return null;
    if (val === undefined) return undefined;
    return val;
  }, z.string().nullable().optional()),

  addressCity: z.preprocess((val) => {
    // '' => null; undefined => undefined (não alterar)
    if (val === '') return null;
    if (val === undefined) return undefined;
    return val;
  }, z.string().nullable().optional()),

  addressNeighborhood: z.preprocess((val) => {
    // '' => null; undefined => undefined (não alterar)
    if (val === '') return null;
    if (val === undefined) return undefined;
    return val;
  }, z.string().nullable().optional()),

  service: z.preprocess((val) => {
    // '' => null; undefined => undefined (não alterar)
    if (val === '') return null;
    if (val === undefined) return undefined;
    return val;
  }, z.string().nullable().optional()),

  // 👇 NOVO: roleId opcional/nullable para atualizar/limpar cargo
  roleId: z.string().uuid().nullable().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// Schema para parâmetros de paginação
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'email', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
