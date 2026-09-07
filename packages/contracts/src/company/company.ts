import { z } from 'zod'
import { addressOutputSchema, cnpjSchema } from '../common/document.js'
import { emailSchema, idSchema, nameSchema, phoneSchema, roleSchema } from '../common/primitives.js'

/**
 * Empresa (o tenant) e seus usuarios — glossario `Company` e `User`.
 *
 * `.strict()` em toda entrada: chave desconhecida vira erro em vez de ser
 * descartada em silencio. E o que faz o principio 8 valer na pratica — um
 * `companyId` enfiado no corpo e recusado alto, nao ignorado.
 */

export const createCompanyInputSchema = z
  .object({
    /** Razao social, como consta no CNPJ. */
    legalName: nameSchema,
    /** Nome de fachada. Ausente = usa a razao social. */
    tradeName: nameSchema.optional(),
    cnpj: cnpjSchema,
    email: emailSchema,
    phone: phoneSchema,
  })
  .strict()

export type CreateCompanyInput = z.infer<typeof createCompanyInputSchema>

/** Atualizacao e parcial, menos o CNPJ: trocar CNPJ e outra empresa. */
export const updateCompanyInputSchema = createCompanyInputSchema
  .omit({ cnpj: true })
  .partial()
  .strict()

export type UpdateCompanyInput = z.infer<typeof updateCompanyInputSchema>

export const companyOutputSchema = z.object({
  id: idSchema,
  legalName: z.string(),
  tradeName: z.string(),
  cnpj: z.string(),
  email: z.string(),
  phone: z.string(),
  /**
   * O endereco da loja — RF-003.
   *
   * Anulavel: ele chega pela busca de CNPJ e pode faltar. Exigir aqui travaria
   * o cadastro de quem instala o sistema antes de ter a inscricao pronta.
   */
  address: addressOutputSchema,
  createdAt: z.string(),
})

export type CompanyOutput = z.infer<typeof companyOutputSchema>

export const createUserInputSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    role: roleSchema,
  })
  .strict()

export type CreateUserInput = z.infer<typeof createUserInputSchema>

export const userOutputSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string(),
  role: roleSchema,
})

export type UserOutput = z.infer<typeof userOutputSchema>
