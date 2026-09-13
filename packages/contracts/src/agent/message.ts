import { z } from 'zod'

/**
 * Mensagem ao assistente — RF-096.
 *
 * O canal HTTP existe para exercitar o runtime sem WhatsApp (NR-060). O
 * webhook entra depois, atras da mesma `processMessage`. O texto e o mesmo
 * campo nos dois caminhos, para nao nascer um schema paralelo.
 */

export const agentMessageInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'A mensagem nao pode ser vazia.')
      .max(4000, 'Mensagem longa demais. Resuma e envie de novo.'),
  })
  .strict()

export type AgentMessageInput = z.infer<typeof agentMessageInputSchema>

export const agentReplyKindSchema = z.enum([
  'answer',
  'clarify',
  'unknown',
  'confirmation',
  'ignored',
])

export type AgentReplyKind = z.infer<typeof agentReplyKindSchema>

export const agentReplySchema = z
  .object({
    kind: agentReplyKindSchema,
    text: z.string(),
    confirmationId: z.string().optional(),
  })
  .strict()

export type AgentReply = z.infer<typeof agentReplySchema>
