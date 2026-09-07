import { AppError, type FieldIssue } from '@na-regua/core'
import type { z } from 'zod'

/**
 * Valida entrada com um schema de `contracts` — RNF-027.
 *
 * Existe para que nenhum handler chame `schema.parse()` direto: o `ZodError`
 * cru traz `code`, `expected`, `received` e o caminho como array, tudo em
 * ingles. Isso e vocabulario de biblioteca, nao mensagem para o lojista
 * (RNF-054). Aqui ele vira `AppError` com a lista de campos que a tela usa
 * para destacar onde esta o problema.
 */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input)
  if (result.success) return result.data as z.infer<S>

  const fields: FieldIssue[] = result.error.issues.map((issue) => ({
    /* Caminho como string: `items.0.quantity` chega pronto para a tela. */
    path: issue.path.join('.'),
    message: issue.message,
  }))

  throw AppError.validation('Confira os campos indicados e tente de novo.', fields)
}
