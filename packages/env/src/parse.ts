import type { z } from 'zod'

/**
 * Valida e falha alto.
 *
 * A regra e ambientes.md: "aplicacao falha ao subir se faltar variavel
 * obrigatoria" — falhar cedo, nao na primeira requisicao. O Zod acumula todos
 * os problemas antes de devolver o erro, entao a mensagem lista tudo de uma
 * vez: sem isso, cada boot revela uma variavel faltando por vez, e corrigir o
 * .env vira um ciclo de tentativa e erro.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: NodeJS.ProcessEnv,
  app: string,
): z.infer<S> {
  const result = schema.safeParse(source)
  if (result.success) return result.data as z.infer<S>

  const linhas = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)

  throw new Error(
    `Configuracao invalida para ${app}. Corrija o .env e tente de novo:\n${linhas.join('\n')}`,
  )
}
