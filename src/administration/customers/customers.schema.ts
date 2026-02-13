import { z } from 'zod';
import { CustomerKind, AddressType } from './entities';

// Schema para criação de endereço
export const CreateAddressSchema = z.object({
  addressType: z.nativeEnum(AddressType),
  label: z.string().optional(),
  isPrimary: z.boolean().optional(),
  street: z.string(),
  number: z.string().optional(),
  complement: z.string().optional(),
  district: z.string().optional(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string().optional(),
  reference: z.string().optional(),
});

// Schema para atualização de endereço
export const UpdateAddressSchema = CreateAddressSchema.partial();

// Schema para criação de pessoa
export const CreatePersonNestedSchema = z.object({
  fullName: z.string(),
  cpf: z.string(),
  rg: z.string().optional(),
  birthDate: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  addresses: z.array(CreateAddressSchema).optional(),
});

// Schema para referência de pessoa em empresa
export const CompanyPersonRefSchema = z.object({
  personId: z.string().optional(),
  cpf: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().optional(),
  isLegalRepresentative: z.boolean().optional(),
  startedOn: z.string().optional(),
  endedOn: z.string().optional(),
  createPerson: CreatePersonNestedSchema.optional(),
});

// Schema para criação de empresa
export const CreateCompanyNestedSchema = z.object({
  legalName: z.string(),
  tradeName: z.string().optional(),
  cnpj: z.string(),
  stateRegistration: z.string().optional(),
  municipalRegistration: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  // ------ NOVOS CAMPOS OPCIONAIS ------
  status: z.string().optional(),
  openingDate: z.string().optional(), // 'dd/MM/yyyy'
  legalNature: z.string().optional(),
  size: z.string().optional(),
  mainActivity: z.string().optional(),
  secondaryActivities: z.array(z.string()).optional(),
  addresses: z.array(CreateAddressSchema).optional(),
  people: z.array(CompanyPersonRefSchema).optional(),
});

// Schema para criação de cliente
export const CreateCustomerSchema = z.object({
  kind: z.nativeEnum(CustomerKind),
  displayName: z.string(),
  person: CreatePersonNestedSchema.optional(),
  company: CreateCompanyNestedSchema.optional(),
});

// Schema para atualização de cliente
export const UpdateCustomerSchema = z.object({
  displayName: z.string().optional(),
  isActive: z.boolean().optional(),
  // Campos de pessoa (quando customer.kind === PERSON)
  fullName: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  birthDate: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
});

// Schema para vinculação de pessoa
export const LinkPersonSchema = z.object({
  personId: z.string().optional(),
  cpf: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().optional(),
  isLegalRepresentative: z.boolean().optional(),
  createPerson: CreatePersonNestedSchema.optional(),
});

// Schema para criação de filial (customer-level)
export const CreateBranchSchema = z
  .object({
    existingCustomerId: z.string().optional(),
    createCustomer: CreateCustomerSchema.optional(),
    note: z.string().optional(),
    since: z.string().optional(),
    until: z.string().optional(),
  })
  .strict(); // 👈 IMPORTANTE: não aceite chaves desconhecidas

// Schema union que aceita tanto o formato padrão quanto o formato "curto" (payload de Customer direto)
export const CreateBranchAcceptingShortSchema = z.union([
  // 1º tenta casar como "payload curto" (Customer)
  CreateCustomerSchema.extend({
    note: z.string().optional(),
    since: z.string().optional(),
    until: z.string().optional(),
  }).strict(), // valida Customer e não permite chaves fora do schema
  // 2º fallback para o formato branch "padrão"
  CreateBranchSchema, // { existingCustomerId?; createCustomer?; ... }
]);

// Tipos TypeScript derivados dos schemas
export type CreateAddressDto = z.infer<typeof CreateAddressSchema>;
export type UpdateAddressDto = z.infer<typeof UpdateAddressSchema>;
export type CreatePersonNestedDto = z.infer<typeof CreatePersonNestedSchema>;
export type CompanyPersonRefDto = z.infer<typeof CompanyPersonRefSchema>;
export type CreateCompanyNestedDto = z.infer<typeof CreateCompanyNestedSchema>;
export type CreateCustomerDto = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof UpdateCustomerSchema>;
export type LinkPersonDto = z.infer<typeof LinkPersonSchema>;
export type CreateBranchDto = z.infer<typeof CreateBranchSchema>;
