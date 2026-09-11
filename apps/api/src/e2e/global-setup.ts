import { migrate } from '@na-regua/db'

/**
 * Aplica as migrations UMA VEZ, antes de qualquer arquivo de teste abrir.
 *
 * Os quatro testes de ponta a ponta (`e2e/*.test.ts`) cada um chama
 * `migrate()` no proprio `beforeAll`. O Vitest roda arquivos em paralelo por
 * padrao, e as quatro chamadas corriam ao mesmo tempo contra o MESMO Postgres
 * da CI — banco vazio, entao as quatro tentavam aplicar as onze migrations do
 * zero juntas. A trava de `pg_advisory_lock` em `migrate.ts` serializa as
 * ESCRITAS, mas nao evita que duas sessoes, liberadas em sequencia, cada uma
 * ainda tente criar a MESMA tabela nova: `relation "crm_cards" already
 * exists` nas quatro suites, sempre, nao so as vezes.
 *
 * `globalSetup` do Vitest roda uma vez, num processo a parte, ANTES de abrir
 * qualquer worker — a corrida deixa de existir porque nao ha mais concorrente
 * nenhum. Quando os arquivos comecam, as migrations ja estao aplicadas, e o
 * `migrate()` de cada `beforeAll` so confirma o que ja esta la (`jaEstavam`).
 *
 * Sem `DATABASE_URL`/`DATABASE_MIGRATION_URL` (maquina sem Postgres local),
 * nao faz nada — os proprios arquivos de teste usam
 * `describe.skipIf(!DATABASE_URL)` e pulam sozinhos.
 */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
  if (url === undefined) return
  await migrate(url)
}
