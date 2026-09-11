import { z } from 'zod'
import { dateTimeSchema, idSchema, phoneSchema } from '../common/primitives.js'

/**
 * Conexao entre lojistas por proximidade — ADR-0008, DEC-021.
 *
 * Busca quem vende um produto perto de mim, e pedido de conexao para liberar
 * o contato. Dado sensivel (telefone, endereco completo) so sai depois que a
 * conexao e ACEITA pelos dois lados — antes disso, so nome da empresa,
 * bairro/cidade e distancia aproximada.
 */

export const buscarFornecedoresQuerySchema = z
  .object({
    termo: z
      .string()
      .trim()
      .min(2, 'Digite ao menos 2 caracteres.')
      .max(80, 'Termo de busca muito longo.'),
  })
  .strict()

export type BuscarFornecedoresQuery = z.infer<typeof buscarFornecedoresQuerySchema>

/**
 * Um resultado da busca — RF-01, RF-02, RF-03.
 *
 * `distanceKm` e nulo quando quem busca ainda nao tem coordenada resolvida
 * (CEP sem geocodificacao) — a lista aparece sem ordenacao por distancia
 * nesse caso, nao vazia.
 */
export const supplierSearchResultSchema = z.object({
  companyId: idSchema,
  companyName: z.string(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  distanceKm: z.number().nullable(),
  /** O(s) produto(s) que fizeram esta empresa aparecer na busca. */
  products: z.array(z.string()),
})

export type SupplierSearchResult = z.infer<typeof supplierSearchResultSchema>

export const supplierSearchOutputSchema = z.object({
  results: z.array(supplierSearchResultSchema),
})

export type SupplierSearchOutput = z.infer<typeof supplierSearchOutputSchema>

/**
 * Uma sugestao — "empresas do seu ramo ja se conectaram com esta" (ADR-0008).
 *
 * `peerCount` e o que sustenta a sugestao: quantas empresas do MESMO ramo
 * que a que busca ja tem conexao aceita com esta. Sem IA, sem lista de
 * palavra-chave por ramo — so filtragem colaborativa com o dado que ja existe.
 */
export const supplierSuggestionSchema = z.object({
  companyId: idSchema,
  companyName: z.string(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  distanceKm: z.number().nullable(),
  peerCount: z.number().int(),
})

export type SupplierSuggestion = z.infer<typeof supplierSuggestionSchema>

export const supplierSuggestionsOutputSchema = z.object({
  suggestions: z.array(supplierSuggestionSchema),
})

export type SupplierSuggestionsOutput = z.infer<typeof supplierSuggestionsOutputSchema>

export const requestConnectionInputSchema = z
  .object({
    targetCompanyId: idSchema,
  })
  .strict()

export type RequestConnectionInput = z.infer<typeof requestConnectionInputSchema>

export const CONNECTION_STATUSES = ['pending', 'accepted', 'rejected', 'expired'] as const

export const connectionStatusSchema = z.enum(CONNECTION_STATUSES, {
  error: 'Estado de conexao invalido.',
})

export type ConnectionStatus = z.infer<typeof connectionStatusSchema>

/**
 * O contato completo da outra empresa — so existe quando `status` e
 * `accepted`. Antes disso este campo nem aparece no JSON (nulo).
 */
export const connectionContactSchema = z.object({
  phone: phoneSchema,
  postalCode: z.string().nullable(),
  street: z.string().nullable(),
  streetNumber: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
})

export type ConnectionContact = z.infer<typeof connectionContactSchema>

export const connectionSchema = z.object({
  id: idSchema,
  /** `sent`: eu pedi. `received`: pediram para mim. */
  direction: z.enum(['sent', 'received']),
  status: connectionStatusSchema,
  otherCompanyId: idSchema,
  otherCompanyName: z.string(),
  createdAt: dateTimeSchema,
  respondedAt: dateTimeSchema.nullable(),
  expiresAt: dateTimeSchema,
  contact: connectionContactSchema.nullable(),
})

export type Connection = z.infer<typeof connectionSchema>

export const connectionListOutputSchema = z.object({
  connections: z.array(connectionSchema),
})

export type ConnectionListOutput = z.infer<typeof connectionListOutputSchema>

export const connectionRequestOutputSchema = z.object({
  id: idSchema,
})

export type ConnectionRequestOutput = z.infer<typeof connectionRequestOutputSchema>

export const connectionPendingCountOutputSchema = z.object({
  count: z.number().int(),
})

export type ConnectionPendingCountOutput = z.infer<typeof connectionPendingCountOutputSchema>
