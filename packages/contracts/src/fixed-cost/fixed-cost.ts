import { z } from 'zod'
import { idSchema, moneyCentsSchema } from '../common/primitives.js'

/**
 * Custo fixo — glossario `FixedCost`. NR-110.
 *
 * Previsao recorrente de gasto (aluguel, energia, assinatura), distinta de
 * `Payable`: custo fixo e um MOLDE, sem vencimento proprio — tem dia do mes,
 * e "gerar as contas do mes" e que materializa a conta a pagar de verdade.
 */

export const createFixedCostInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do custo fixo.').max(140, 'Nome muito longo.'),
    amountCents: moneyCentsSchema.min(1, 'Informe um valor maior que zero.'),
    /** Dia do mes em que costuma vencer. 31 em fevereiro cai no ultimo dia. */
    dueDay: z
      .number()
      .int('O dia deve ser inteiro.')
      .min(1, 'O dia deve estar entre 1 e 31.')
      .max(31, 'O dia deve estar entre 1 e 31.'),
    /** Classificacao no plano de contas — opcional, pode ser feita depois. */
    accountId: idSchema.optional(),
  })
  .strict()

export type CreateFixedCostInput = z.infer<typeof createFixedCostInputSchema>

/** Mesma forma da criacao: editar um custo fixo e redefini-lo por completo. */
export const updateFixedCostInputSchema = createFixedCostInputSchema

export type UpdateFixedCostInput = z.infer<typeof updateFixedCostInputSchema>

export const fixedCostOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  amountCents: z.number().int(),
  dueDay: z.number().int(),
  accountId: idSchema.nullable(),
  /** Vem junto — a tela sempre mostra o nome, nunca o uuid. */
  accountName: z.string().nullable(),
  createdAt: z.string(),
})

export type FixedCostOutput = z.infer<typeof fixedCostOutputSchema>

/**
 * Gerar as contas do mes — o unico caso de uso alem do CRUD.
 *
 * `competencia` no formato `AAAA-MM`, e nao uma data: a pergunta e "gere as
 * contas de setembro", nunca "gere a conta do dia 15".
 */
export const generateFixedCostPayablesInputSchema = z
  .object({
    competencia: z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.'),
  })
  .strict()

export type GenerateFixedCostPayablesInput = z.infer<typeof generateFixedCostPayablesInputSchema>
