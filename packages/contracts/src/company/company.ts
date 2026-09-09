import { z } from 'zod'
import { cnpjSchema } from '../common/document.js'
import {
  emailSchema,
  idSchema,
  nameSchema,
  phoneSchema,
  rateSchema,
  roleSchema,
  ufSchema,
} from '../common/primitives.js'

/**
 * Empresa (o tenant) e seus usuarios — glossario `Company` e `User`.
 *
 * Um usuario pertence a exatamente uma empresa (`users.company_id`).
 * `.strict()`: `companyId` no corpo e recusado (principio 8).
 */

export const taxRegimeSchema = z.enum(
  ['mei', 'simples_nacional', 'lucro_presumido', 'lucro_real'],
  {
    errorMap: () => ({ message: 'Regime tributario invalido.' }),
  },
)
export type TaxRegime = z.infer<typeof taxRegimeSchema>

export const certificateStatusSchema = z.enum(['missing', 'valid', 'expired', 'rejected'])
export type CertificateStatus = z.infer<typeof certificateStatusSchema>

export const paymentsOnboardingStatusSchema = z.enum([
  'not_started',
  'pending',
  'approved',
  'rejected',
])
export type PaymentsOnboardingStatus = z.infer<typeof paymentsOnboardingStatusSchema>

const cepSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((d) => d.length === 8, { message: 'CEP invalido. Use 8 digitos.' })

export const addressSchema = z
  .object({
    cep: cepSchema,
    street: nameSchema,
    number: z.string().trim().min(1, 'Informe o numero.').max(20),
    complement: z.string().trim().max(80).optional(),
    neighborhood: nameSchema,
    city: nameSchema,
    state: ufSchema,
  })
  .strict()

export type Address = z.infer<typeof addressSchema>

export const createCompanyInputSchema = z
  .object({
    legalName: nameSchema,
    tradeName: nameSchema.optional(),
    cnpj: cnpjSchema,
    email: emailSchema,
    phone: phoneSchema,
    stateRegistration: z.string().trim().max(20).optional(),
    municipalRegistration: z.string().trim().max(20).optional(),
    taxRegime: taxRegimeSchema,
    /**
     * Autodeclaracao. Padrao false. True nao impede o ERP; impede emissao fiscal
     * (RF-146). Consulta CNPJ nao descobre Hibrido.
     */
    optedReformaHibrida: z.boolean().default(false),
    /** Aliquota do calculo da venda. Nao vai para o provedor fiscal. */
    taxRate: rateSchema.optional(),
    address: addressSchema,
  })
  .strict()

export type CreateCompanyInput = z.infer<typeof createCompanyInputSchema>

/** CNPJ nao troca: outra empresa. CSC e A1 nao entram neste JSON. */
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
  stateRegistration: z.string().nullable(),
  municipalRegistration: z.string().nullable(),
  taxRegime: taxRegimeSchema,
  optedReformaHibrida: z.boolean(),
  taxRate: z.number().nullable(),
  address: addressSchema,
  cityIbgeCode: z.string().nullable(),
  fiscalCompanyId: z.string().nullable(),
  fiscalNfceEnabled: z.boolean(),
  fiscalNfseEnabled: z.boolean(),
  certificateStatus: certificateStatusSchema,
  certificateExpiresAt: z.string().nullable(),
  hasNfceCsc: z.boolean(),
  paymentsOnboardingStatus: paymentsOnboardingStatusSchema,
  createdAt: z.string(),
})

export type CompanyOutput = z.infer<typeof companyOutputSchema>

/** Signup da jornada A — ainda sem empresa. */
export const createAccountInputSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres.'),
    coupon: z.string().trim().max(40).optional(),
  })
  .strict()

export type CreateAccountInput = z.infer<typeof createAccountInputSchema>

/** Staff futuro: mesmo `company_id` do owner, nunca outra empresa. */
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
  phone: phoneSchema.optional(),
  role: roleSchema,
  /** Nulo entre o signup e `/app/empresa`. */
  companyId: idSchema.nullable(),
})

export type UserOutput = z.infer<typeof userOutputSchema>
