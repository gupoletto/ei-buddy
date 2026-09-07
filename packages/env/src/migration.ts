import { z } from 'zod'
import { parseEnv } from './parse.js'

/**
 * Variavel que o runner de migrations le — ambientes.md#matriz.
 *
 * Fica separada de `apiEnvSchema` de proposito: `DATABASE_MIGRATION_URL` aponta
 * para um papel com `BYPASSRLS`, e a api **nao pode** ter acesso a ela. Se as
 * duas morassem no mesmo schema, um `loadApiEnv()` passaria a exigir — e a
 * expor — a credencial que ignora o isolamento entre empresas.
 *
 * Ver docs/arquitetura/dados.md#multi-tenant e ADR-0001.
 */
export const migrationEnvSchema = z.object({
  DATABASE_MIGRATION_URL: z
    /*
     * A mensagem da variavel AUSENTE, que e a parte que costuma faltar.
     *
     * Sem ela, variavel ausente — o caso comum — cai na mensagem padrao do Zod
     * ("Invalid input"), e a orientacao escrita no `.min(1)` so aparece para
     * string vazia, que quase nunca acontece. A mensagem tem de dizer o proximo
     * passo (RNF-054) justamente no caso em que a pessoa nao configurou nada.
     *
     * No Zod 3 isto era `required_error`, separado de `invalid_type_error`. O
     * Zod 4 unificou os dois em `error`, e aqui a unificacao nao perde nada:
     * valor de `process.env` e string ou ausente, entao "tipo errado" nao
     * acontece.
     */
    .string({
      error:
        'DATABASE_MIGRATION_URL e obrigatoria para rodar migrations. ' +
        'Copie .env.example para .env ou rode `pnpm setup`.',
    })
    .min(
      1,
      'DATABASE_MIGRATION_URL esta vazia. ' + 'Copie .env.example para .env ou rode `pnpm setup`.',
    )
    .regex(
      /^postgres(ql)?:\/\//,
      'DATABASE_MIGRATION_URL precisa comecar com postgresql:// ou postgres://.',
    ),
})

export type MigrationEnv = z.infer<typeof migrationEnvSchema>

/** Valida `process.env` para o runner de migrations. */
export function loadMigrationEnv(source: NodeJS.ProcessEnv = process.env): MigrationEnv {
  return parseEnv(migrationEnvSchema, source, 'migrations')
}
