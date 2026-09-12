import { z } from 'zod'
import { dateSchema, idSchema, moneyCentsSchema } from '../common/primitives.js'

/** Contas a pagar e a receber — glossario `Payable` / `Receivable`. RF-055 a RF-065. */

export const payableStatusSchema = z.enum(['open', 'partially_settled', 'settled', 'cancelled'])

export type PayableStatus = z.infer<typeof payableStatusSchema>

export const recurrenceFrequencySchema = z.enum(['weekly', 'monthly'])

export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>

/**
 * Recorrencia — RF-057.
 *
 * `occurrences` conta a PRIMEIRA: 12 quer dizer um ano de conta mensal, nao
 * treze meses. Contar a partir da segunda seria a fonte garantida de uma
 * parcela a mais ou a menos, e ninguem confere doze linhas na tela.
 *
 * Nao ha "recorrencia sem fim". Conta que se repete para sempre e conta que
 * ninguem lembra de encerrar, e o lojista descobre pela lista de vencidos.
 */
export const recurrenceInputSchema = z
  .object({
    frequency: recurrenceFrequencySchema,
    occurrences: z
      .number()
      .int('O numero de ocorrencias deve ser inteiro.')
      .min(2, 'Recorrencia de uma ocorrencia so e uma conta comum.')
      .max(120, 'A recorrencia nao pode passar de 120 ocorrencias.'),
  })
  .strict()

export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>

/** Lancar conta a pagar — RF-055. */
export const createPayableInputSchema = z
  .object({
    /**
     * Texto livre, e nao um id de fornecedor: nao existe cadastro de
     * fornecedor no MVP, e exigir um travaria o lancamento da conta de luz.
     */
    supplier: z.string().trim().min(2, 'Informe o fornecedor.').max(140, 'Nome muito longo.'),
    description: z.string().trim().min(2, 'Descreva a conta.').max(280, 'Descricao muito longa.'),
    amountCents: moneyCentsSchema.min(1, 'Conta de zero nao e conta.'),
    dueDate: dateSchema,
    /**
     * Anexo — RF-055. Guarda a chave do arquivo no armazenamento, nao o
     * arquivo: contrato de conta de aluguel em base64 dentro do JSON da
     * requisicao e o jeito de descobrir o limite de corpo do servidor.
     */
    attachmentKey: z.string().trim().max(512).optional(),
    /**
     * Classificacao contabil — RF-083.
     *
     * Id de conta do plano, e nao texto livre. A NR-074 tinha um `category`
     * de texto aqui: era invencao minha (a RF-055 nao pede campo de categoria)
     * e passou a duplicar o plano de contas quando ele ganhou tabela, dando
     * DUAS respostas para "como esta conta esta classificada".
     */
    accountId: idSchema.optional(),
    recurrence: recurrenceInputSchema.optional(),
  })
  .strict()

export type CreatePayableInput = z.infer<typeof createPayableInputSchema>

/** Recebivel avulso, que nao vem de venda — RF-065. */
export const createReceivableInputSchema = z
  .object({
    description: z.string().trim().min(2, 'Descreva o recebivel.').max(280),
    amountCents: moneyCentsSchema.min(1, 'Conta de zero nao e conta.'),
    dueDate: dateSchema,
    customerId: idSchema.optional(),
    accountId: idSchema.optional(),
  })
  .strict()

export type CreateReceivableInput = z.infer<typeof createReceivableInputSchema>

/** Encerrar a recorrencia — RF-058. */
export const endRecurrenceInputSchema = z.object({ recurrenceId: idSchema }).strict()

export type EndRecurrenceInput = z.infer<typeof endRecurrenceInputSchema>

/**
 * Exportar a lista de titulos — botao "Exportar" de `ContasView.tsx`.
 *
 * Vale para pagar e para receber: as duas telas exportam a mesma forma de
 * lista, so a contraparte muda.
 */
export const exportarTitulosQuerySchema = z
  .object({ formato: z.enum(['csv', 'pdf']).default('csv') })
  .strict()

export type ExportarTitulosQuery = z.infer<typeof exportarTitulosQuerySchema>

export const payableOutputSchema = z.object({
  id: idSchema,
  supplier: z.string(),
  description: z.string(),
  amountCents: z.number().int(),
  settledAmountCents: z.number().int(),
  dueDate: z.string(),
  status: payableStatusSchema,
  attachmentKey: z.string().nullable(),
  /** Conta do plano. Nulo cai em "Sem classificacao" no DRE. */
  accountId: idSchema.nullable(),
  /** Liga as ocorrencias da mesma recorrencia. Nulo em conta avulsa. */
  recurrenceId: idSchema.nullable(),
  /** Ocorrencia N de M — o que a tela mostra como "3/12". */
  occurrenceNumber: z.number().int().nullable(),
  occurrenceCount: z.number().int().nullable(),
  createdAt: z.string(),
})

export type PayableOutput = z.infer<typeof payableOutputSchema>
