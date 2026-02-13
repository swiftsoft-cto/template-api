import { z } from 'zod';

// Schema para o payload do webhook do Autentique
export const AutentiqueWebhookEventSchema = z.object({
  id: z.string(),
  object: z.literal('webhook'),
  name: z.string(),
  format: z.string(),
  url: z.string(),
  event: z.object({
    id: z.string(),
    object: z.literal('event'),
    organization: z.number(),
    type: z.enum([
      'document.created',
      'document.updated',
      'document.deleted',
      'document.finished',
      'signature.created',
      'signature.updated',
      'signature.deleted',
      'signature.viewed',
      'signature.accepted',
      'signature.rejected',
      'signature.biometric_approved',
      'signature.biometric_unapproved',
      'signature.biometric_rejected',
      'member.created',
      'member.deleted',
    ]),
    data: z.any(), // Estrutura varia conforme o tipo de evento
    previous_attributes: z.any().optional(),
    created_at: z.string(),
  }),
});

export type AutentiqueWebhookEvent = z.infer<
  typeof AutentiqueWebhookEventSchema
>;
