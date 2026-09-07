import { z } from 'zod'
import { dateTimeSchema, idSchema } from '../common/primitives.js'

/**
 * Chamados de suporte — NR-080, US-062.
 *
 * O chamado e a CONVERSA. As mensagens vem separadas porque a equipe responde
 * de fora do app, por um painel proprio — o mesmo motivo de serem duas tabelas.
 */

export const CATEGORIAS_DE_CHAMADO = [
  'financeiro',
  'cadastro',
  'vendas',
  'tecnico',
  'outro',
] as const

export const ticketCategorySchema = z.enum(CATEGORIAS_DE_CHAMADO, {
  error: 'Categoria de chamado invalida.',
})

export type TicketCategory = z.infer<typeof ticketCategorySchema>

export const STATUS_DE_CHAMADO = ['aberto', 'andamento', 'respondido', 'encerrado'] as const

export const ticketStatusSchema = z.enum(STATUS_DE_CHAMADO, {
  error: 'Estado de chamado invalido.',
})

export type TicketStatus = z.infer<typeof ticketStatusSchema>

/**
 * Abrir chamado — US-062.
 *
 * Assunto com minimo de verdade: "erro" nao e assunto, e um chamado que chega
 * assim custa uma ida e volta so para descobrir do que se trata. O corpo tem
 * minimo maior pelo mesmo motivo.
 */
export const openTicketInputSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(5, 'Diga em poucas palavras do que se trata.')
      .max(140, 'Assunto muito longo. O detalhe cabe na mensagem.'),
    category: ticketCategorySchema,
    body: z
      .string()
      .trim()
      .min(10, 'Conte o que aconteceu — quanto mais detalhe, mais rapida a resposta.')
      .max(4000, 'Mensagem muito longa.'),
    attachment: z.string().trim().max(200).optional(),
  })
  .strict()

export type OpenTicketInput = z.infer<typeof openTicketInputSchema>

export const replyToTicketInputSchema = z
  .object({
    ticketId: idSchema,
    body: z.string().trim().min(1, 'Escreva a mensagem.').max(4000, 'Mensagem muito longa.'),
    attachment: z.string().trim().max(200).optional(),
  })
  .strict()

export type ReplyToTicketInput = z.infer<typeof replyToTicketInputSchema>

export const ticketMessageSchema = z.object({
  id: idSchema,
  author: z.enum(['cliente', 'suporte']),
  authorName: z.string(),
  body: z.string(),
  attachment: z.string().nullable(),
  createdAt: dateTimeSchema,
})

export type TicketMessage = z.infer<typeof ticketMessageSchema>

/**
 * Um chamado na lista.
 *
 * `unread` e CONTADO a partir de `lastReadAt`, e nunca guardado. Um contador
 * teria dois donos — o painel do suporte incrementa, o app zera — e divergiria
 * sem que ninguem soubesse qual dos dois errou.
 */
export const ticketSummarySchema = z.object({
  id: idSchema,
  protocol: z.string(),
  subject: z.string(),
  category: ticketCategorySchema,
  status: ticketStatusSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  unread: z.number().int(),
})

export type TicketSummary = z.infer<typeof ticketSummarySchema>

export const ticketDetailSchema = ticketSummarySchema.extend({
  messages: z.array(ticketMessageSchema),
})

export type TicketDetail = z.infer<typeof ticketDetailSchema>

export const ticketListOutputSchema = z.object({
  tickets: z.array(ticketSummarySchema),
  /** Quantos ainda nao foram encerrados — o numero do topo da tela. */
  open: z.number().int(),
  /** Somatorio das nao lidas — o que acende o sino da barra. */
  unread: z.number().int(),
})

export type TicketListOutput = z.infer<typeof ticketListOutputSchema>
