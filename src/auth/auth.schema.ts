import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email({ message: 'validation.email.invalid_email' }),
  password: z.string().min(1, { message: 'validation.password.required' }),
});

export const refreshSchema = z.object({
  // refreshToken removido - agora só via cookie HttpOnly
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

export class LoginDto implements LoginInput {
  static schema = loginSchema;
  email!: string;
  password!: string;
}

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'validation.email.invalid_email' }),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
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
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export class ForgotPasswordDto implements ForgotPasswordInput {
  static schema = forgotPasswordSchema;
  email!: string;
}

export class ResetPasswordDto implements ResetPasswordInput {
  static schema = resetPasswordSchema;
  token!: string;
  password!: string;
}

export class RefreshDto implements RefreshInput {
  static schema = refreshSchema;
  // refreshToken removido - agora só via cookie HttpOnly
}

// ======================== ALTERAR SENHA (com senha atual) ========================

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { message: 'validation.password.required' }),
    newPassword: z
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
  })
  .superRefine((data, ctx) => {
    if (
      data.currentPassword &&
      data.newPassword &&
      data.currentPassword === data.newPassword
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newPassword'],
        message: 'validation.password.must_differ', // (se não houver chave no i18n, cai como literal)
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export class ChangePasswordDto implements ChangePasswordInput {
  static schema = changePasswordSchema;
  currentPassword!: string;
  newPassword!: string;
}

// ======================== ATUALIZAR MEUS DADOS ========================

export const updateMeSchema = z.object({
  name: z.string().min(1, { message: 'validation.name.required' }),
  email: z
    .string()
    .email({ message: 'validation.email.invalid_email' })
    .optional(),
  phone: z.preprocess(
    (val) => {
      // '' => null (limpar); undefined => undefined (não alterar)
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
      // '' => null; undefined => undefined (não alterar)
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
      // '' => null; undefined => undefined (não alterar)
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
  currentPassword: z
    .string()
    .min(1, { message: 'validation.password.required' })
    .optional(),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export class UpdateMeDto implements UpdateMeInput {
  static schema = updateMeSchema;
  name!: string;
  email?: string;
  phone?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  birthdate?: Date | null;
  postalCode?: string | null;
  address?: string | null;
  addressState?: string | null;
  addressCity?: string | null;
  addressNeighborhood?: string | null;
  service?: string | null;
  currentPassword?: string;
}
