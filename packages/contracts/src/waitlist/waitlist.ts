import { z } from 'zod'
import { idSchema, nameSchema, phoneSchema } from '../common/primitives.js'

/**
 * Lista de espera do pre-lancamento — glossario `WaitlistEntry`. NR-111.
 *
 * Quem responde nao tem empresa: e o formulario publico `/lista-vip`, aberto
 * antes de existir cadastro. As perguntas fechadas gravam a CHAVE em ingles
 * (ver `painPointSchema` etc.), nunca o texto em portugues da tela — a tela e
 * quem traduz chave para rotulo, e pode reescrever a pergunta sem migrar
 * dado.
 */

export const painPointSchema = z.enum([
  'cash_flow',
  'more_customers',
  'sales_organization',
  'inventory',
  'collections',
  'routine',
  'profit_visibility',
  'marketing',
  'other',
])

export type PainPoint = z.infer<typeof painPointSchema>

export const usesSystemSchema = z.enum(['none', 'complicated', 'expensive', 'satisfied', 'other'])

export type UsesSystem = z.infer<typeof usesSystemSchema>

export const fairPriceSchema = z.enum([
  'up_to_29',
  'from_30_to_49',
  'from_50_to_69',
  'from_70_to_99',
  'above_100',
  'not_sure',
])

export type FairPrice = z.infer<typeof fairPriceSchema>

export const createWaitlistEntryInputSchema = z
  .object({
    name: nameSchema,
    businessType: z.string().trim().max(120).optional(),
    phone: phoneSchema,
    /** "Como espera que o Buddy ajude" — a unica obrigatoria alem de nome e celular. */
    expectation: z.string().trim().min(1, 'Conte o que espera do Buddy.').max(2000),
    painPoints: z.array(painPointSchema).max(painPointSchema.options.length).default([]),
    /** So faz sentido quando `painPoints` inclui `'other'`. */
    painPointOther: z.string().trim().max(200).optional(),
    usesSystem: usesSystemSchema.optional(),
    /** So faz sentido quando `usesSystem` e `'other'`. */
    usesSystemOther: z.string().trim().max(200).optional(),
    fairPrice: fairPriceSchema.optional(),
    wantsUpdates: z.boolean().default(true),
  })
  .strict()

export type CreateWaitlistEntryInput = z.infer<typeof createWaitlistEntryInputSchema>

export const waitlistEntryOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  businessType: z.string().nullable(),
  phone: z.string(),
  expectation: z.string(),
  painPoints: z.array(painPointSchema),
  painPointOther: z.string().nullable(),
  usesSystem: usesSystemSchema.nullable(),
  usesSystemOther: z.string().nullable(),
  fairPrice: fairPriceSchema.nullable(),
  wantsUpdates: z.boolean(),
  createdAt: z.string(),
})

export type WaitlistEntryOutput = z.infer<typeof waitlistEntryOutputSchema>

/* -------------------------------------------------------------------------- */
/* Painel do Super Admin                                                      */
/* -------------------------------------------------------------------------- */

export const PAGINA_PADRAO_DA_LISTA_VIP = 20
export const PAGINA_MAXIMA_DA_LISTA_VIP = 100

export const listWaitlistEntriesQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1, 'A primeira pagina e a 1.').default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINA_MAXIMA_DA_LISTA_VIP, `A pagina vai ate ${PAGINA_MAXIMA_DA_LISTA_VIP} itens.`)
      .default(PAGINA_PADRAO_DA_LISTA_VIP),
  })
  .strict()

export type ListWaitlistEntriesQuery = z.infer<typeof listWaitlistEntriesQuerySchema>

export const listWaitlistEntriesOutputSchema = z.object({
  entries: z.array(waitlistEntryOutputSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export type ListWaitlistEntriesOutput = z.infer<typeof listWaitlistEntriesOutputSchema>

const contagemSchema = <T extends z.ZodTypeAny>(valor: T) =>
  z.object({ value: valor, count: z.number().int() })

export const waitlistStatsOutputSchema = z.object({
  total: z.number().int(),
  painPoints: z.array(contagemSchema(painPointSchema)),
  usesSystem: z.array(contagemSchema(usesSystemSchema)),
  fairPrice: z.array(contagemSchema(fairPriceSchema)),
  perDay: z.array(z.object({ date: z.string(), count: z.number().int() })),
})

export type WaitlistStatsOutput = z.infer<typeof waitlistStatsOutputSchema>
