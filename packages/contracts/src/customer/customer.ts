import { z } from 'zod'
import { documentSchema } from '../common/document.js'
import {
  emailSchema,
  idSchema,
  moneyCentsSchema,
  nameSchema,
  phoneSchema,
} from '../common/primitives.js'

/**
 * Cliente da loja — glossario `Customer`. Nunca `Client`, que fica reservado
 * para cliente HTTP.
 */

export const createCustomerInputSchema = z
  .object({
    name: nameSchema,
    /**
     * Documento e telefone sao opcionais de proposito: no balcao a venda
     * acontece antes do cadastro completo, e exigir CPF para vender empurra
     * o lojista de volta para o caderno.
     */
    document: documentSchema.optional(),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    notes: z.string().trim().max(500, 'Observacao muito longa.').optional(),
    /** Teto do fiado. Ausente = sem fiado liberado. */
    walletLimitCents: moneyCentsSchema.optional(),
  })
  .strict()

export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>

export const updateCustomerInputSchema = createCustomerInputSchema.partial().strict()
export type UpdateCustomerInput = z.infer<typeof updateCustomerInputSchema>

export const customerOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  document: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  walletLimitCents: z.number().int(),
  /** Saldo devedor. Positivo = o cliente deve para a loja. */
  walletBalanceCents: z.number().int(),
  createdAt: z.string(),
})

export type CustomerOutput = z.infer<typeof customerOutputSchema>

/**
 * Importacao de clientes em lote — NR-072, US-008.
 *
 * Mesma forma da importacao de produtos, e de proposito: as duas telas usam o
 * mesmo dialogo, e formas diferentes fariam o relatorio significar uma coisa
 * numa e outra na outra.
 *
 * `TETO_DA_IMPORTACAO_DE_CLIENTES` existe pelo mesmo motivo do teto de
 * produtos: o lote roda numa requisicao so.
 */
export const TETO_DA_IMPORTACAO_DE_CLIENTES = 500

export const importCustomersInputSchema = z
  .object({
    customers: z
      .array(createCustomerInputSchema)
      .min(1, 'Nenhuma linha valida para importar.')
      .max(
        TETO_DA_IMPORTACAO_DE_CLIENTES,
        `A importacao aceita ate ${TETO_DA_IMPORTACAO_DE_CLIENTES} linhas por vez.`,
      ),
  })
  .strict()

export type ImportCustomersInput = z.infer<typeof importCustomersInputSchema>

export const importCustomersOutputSchema = z.object({
  imported: z.number().int(),
  rejected: z.array(
    z.object({
      index: z.number().int(),
      description: z.string(),
      reason: z.string(),
    }),
  ),
})

export type ImportCustomersOutput = z.infer<typeof importCustomersOutputSchema>
