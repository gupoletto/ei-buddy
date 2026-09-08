import { loadApiEnv } from '@na-regua/env'
import { criarIdentidade } from '../composition.js'
import { IdentidadeBetterAuth } from '../identidade-better-auth.js'

/**
 * Cria as tabelas do provedor de identidade — NR-084, ADR-0002 (opcao D).
 *
 *   pnpm --filter @na-regua/api migrar:identidade
 *
 * ## Por que um script separado de `pnpm db:migrate`
 *
 * Porque as duas migracoes tem DONOS diferentes, e misturar as duas faria a
 * fronteira sumir:
 *
 * - o que e nosso mora em `public` e e migrado por `packages/db`, com SQL que
 *   revisamos;
 * - o que e da biblioteca mora em `identidade` e e migrado por ela, porque o
 *   schema dela muda com a VERSAO. Copiar o DDL para a nossa pasta faria cada
 *   atualizacao do Better Auth pedir um diff escrito a mao — e o erro
 *   apareceria no primeiro login depois do deploy, nao no `pnpm typecheck`.
 *
 * A 0023 cria o schema vazio e explica o resto. Rode `db:migrate` ANTES deste:
 * sem o schema, o `search_path` do provedor aponta para lugar nenhum.
 *
 * ## Nao faz nada com `AUTH_PROVIDER=fake`
 *
 * Sair calado, e nao falhar: o script entra na sequencia de implantacao e no
 * `Verificar` da CI, e nos dois lugares o provedor pode ser o falso. Falhar ali
 * seria quebrar o deploy por causa de um passo que nao tinha o que fazer.
 */
async function principal(): Promise<void> {
  const env = loadApiEnv()

  if (env.AUTH_PROVIDER !== 'better-auth') {
    console.log('AUTH_PROVIDER=%s: nada a migrar no provedor.', env.AUTH_PROVIDER)
    return
  }

  const identidade = criarIdentidade()

  if (!(identidade instanceof IdentidadeBetterAuth)) {
    /* `criarIdentidade` e a unica fonte de verdade sobre qual provedor sobe. Se
       ela devolver outro, o certo e parar — e nao adivinhar aqui. */
    throw new Error('AUTH_PROVIDER=better-auth mas a composicao devolveu outro provedor.')
  }

  try {
    await identidade.migrar()
    console.log('Tabelas do provedor de identidade em dia.')
  } finally {
    /* Sem isto o processo fica pendurado no pool aberto. */
    await identidade.encerrar()
  }
}

await principal()
