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

/**
 * A lista de clientes — NR-072, RF-011.
 *
 * Separada do cadastro (`createCustomerInputSchema`) porque responde outra
 * pergunta: quem sao meus clientes e como cada um se comporta. Por isso ela
 * traz o historico de compra, que o cadastro nao tem.
 */
export const PAGINA_PADRAO_DE_CLIENTES = 24
export const PAGINA_MAXIMA_DE_CLIENTES = 100

/** Quantos dias sem comprar tornam um cliente "inativo" — US-036. */
export const DIAS_PARA_INATIVO = 60

export const customerFilterSchema = z.enum(['todos', 'inativos', 'fiado'])

export type CustomerFilter = z.infer<typeof customerFilterSchema>

export const customerListInputSchema = z
  .object({
    /** Nome, documento ou telefone. */
    q: z.string().trim().max(140).optional(),
    filter: customerFilterSchema.default('todos'),
    page: z.coerce.number().int().min(1, 'A primeira pagina e a 1.').default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINA_MAXIMA_DE_CLIENTES, `A pagina vai ate ${PAGINA_MAXIMA_DE_CLIENTES} clientes.`)
      .default(PAGINA_PADRAO_DE_CLIENTES),
  })
  .strict()

export type CustomerListInput = z.infer<typeof customerListInputSchema>

/**
 * Um cliente na lista, com o que ele ja comprou.
 *
 * O historico vem JUNTO e nao numa segunda chamada: a tela mostra "ultima
 * compra" em toda linha, e busca-lo por cliente daria vinte e cinco idas ao
 * banco para uma pagina.
 */
export const customerListItemSchema = customerOutputSchema.extend({
  /** Nulo = nunca comprou. NAO e "comprou ha muito tempo". */
  lastSaleOn: z.string().nullable(),
  salesCount: z.number().int(),
  totalSpentCents: z.number().int(),
})

export type CustomerListItem = z.infer<typeof customerListItemSchema>

export const customerListOutputSchema = z.object({
  customers: z.array(customerListItemSchema),
  /** Quantos casam com o filtro — nao quantos vieram nesta pagina. */
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
})

export type CustomerListOutput = z.infer<typeof customerListOutputSchema>
