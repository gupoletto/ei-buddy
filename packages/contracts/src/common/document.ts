import { z } from 'zod'

/**
 * CPF e CNPJ.
 *
 * Valida forma, nao existencia: o digito verificador prova que o numero foi
 * digitado certo, nao que a pessoa existe na Receita. Consultar cadastro e
 * responsabilidade de um adapter, nunca daqui.
 */

/** Tira pontuacao. O usuario digita com mascara; o sistema guarda so digitos. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Digito verificador pelo modulo 11.
 *
 * Serve aos dois documentos: o que muda e o peso de cada posicao, e CPF e
 * CNPJ usam sequencias diferentes.
 */
function checkDigit(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce((total, weight, i) => total + Number(digits[i]) * weight, 0)
  const remainder = sum % 11
  return remainder < 2 ? 0 : 11 - remainder
}

const CPF_FIRST = [10, 9, 8, 7, 6, 5, 4, 3, 2] as const
const CPF_SECOND = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2] as const

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 11) return false
  /* 111.111.111-11 passa no modulo 11 mas nao e CPF de ninguem. */
  if (/^(\d)\1{10}$/.test(d)) return false

  return Number(d[9]) === checkDigit(d, CPF_FIRST) && Number(d[10]) === checkDigit(d, CPF_SECOND)
}

const CNPJ_FIRST = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const
const CNPJ_SECOND = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  return Number(d[12]) === checkDigit(d, CNPJ_FIRST) && Number(d[13]) === checkDigit(d, CNPJ_SECOND)
}

/** Guarda so digitos: mascara e decisao de tela, nao de dado. */
export const cpfSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCpf, { message: 'CPF invalido. Confira os numeros.' })

export const cnpjSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCnpj, { message: 'CNPJ invalido. Confira os numeros.' })

/**
 * Cliente pode ser pessoa fisica ou juridica, e o balcao nao pergunta qual —
 * digita o numero e o sistema decide pelo tamanho.
 */
export const documentSchema = z
  .string()
  .transform(onlyDigits)
  .refine((d) => (d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false), {
    message: 'Documento invalido. Informe um CPF ou CNPJ.',
  })

/* -------------------------------------------------------------------------- */
/* Endereco — NR-072, RF-003, RF-011                                          */
/* -------------------------------------------------------------------------- */

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

export const ufSchema = z.enum(UFS, { error: 'UF invalida.' })

export type UF = z.infer<typeof ufSchema>

/**
 * O endereco, com tudo opcional.
 *
 * A RF-009 pede "apenas nome e telefone" para o cliente, e exigir CEP travaria
 * o balcao. Para a empresa o endereco chega pela busca de CNPJ e pode faltar.
 *
 * `number` e TEXTO: existe "s/n", "120-A" e "KM 42".
 */
export const addressSchema = z
  .object({
    zipCode: z
      .string()
      .trim()
      .regex(/^\d{8}$/, 'CEP invalido. Use 8 digitos.')
      .optional(),
    street: z.string().trim().max(160).optional(),
    number: z.string().trim().max(20).optional(),
    complement: z.string().trim().max(80).optional(),
    district: z.string().trim().max(80).optional(),
    city: z.string().trim().max(80).optional(),
    state: ufSchema.optional(),
  })
  .strict()

export type Address = z.infer<typeof addressSchema>

/** O mesmo endereco na saida, com nulo no lugar de ausente. */
export const addressOutputSchema = z.object({
  zipCode: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
})

export type AddressOutput = z.infer<typeof addressOutputSchema>

/**
 * Pessoa fisica ou juridica, DEDUZIDO do documento.
 *
 * Nao ha coluna para isto, de proposito: onze digitos e CPF, catorze e CNPJ, e
 * guardar seria criar uma segunda fonte para a mesma verdade. No dia em que as
 * duas divergissem ninguem saberia qual vale — e um cadastro com CNPJ marcado
 * como pessoa fisica emite nota errada.
 *
 * `null` quando nao ha documento: o cliente de balcao (RF-009) nao tem, e
 * chutar "fisica" seria inventar.
 */
export function tipoDePessoa(documento: string | null): 'fisica' | 'juridica' | null {
  if (documento === null) return null

  const digitos = documento.replace(/\D/g, '')
  if (digitos.length === 11) return 'fisica'
  if (digitos.length === 14) return 'juridica'
  return null
}

/**
 * O DDD, dos dois primeiros digitos do telefone.
 *
 * Tambem nao tem coluna: `phone` guarda o numero inteiro. Duas colunas criariam
 * o estado invalido "DDD de Sao Paulo com celular de Manaus", que nenhuma
 * validacao pega depois de gravado.
 */
export function dddDe(telefone: string | null): string | null {
  if (telefone === null) return null

  const digitos = telefone.replace(/\D/g, '')
  /* Menos de dez digitos nao e telefone brasileiro completo: devolver os dois
     primeiros de um numero pela metade daria um DDD inventado. */
  return digitos.length >= 10 ? digitos.slice(0, 2) : null
}
