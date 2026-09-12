import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

/**
 * Runner de migrations.
 *
 * SQL cru, aplicado em ordem de nome de arquivo, uma transacao por migration.
 * Nao usa o gerador do ORM de proposito: RLS, `FORCE ROW LEVEL SECURITY`,
 * politica e funcao em plpgsql nao tem representacao no schema do Drizzle, e
 * "gera o SQL e depois edita a mao" e o pior dos dois mundos — o arquivo
 * gerado deixa de bater com o schema e ninguem sabe qual dos dois manda.
 *
 * Roda com `DATABASE_MIGRATION_URL`, que aponta para um papel com `BYPASSRLS`.
 * Migration precisa enxergar todas as linhas: uma que rodasse sujeita a RLS
 * alteraria as linhas de uma empresa e ignoraria as das outras, em silencio.
 */

const AQUI = dirname(fileURLToPath(import.meta.url))
const PASTA = join(AQUI, 'migrations')

/**
 * Chave da trava de aplicacao das migrations.
 *
 * Numero arbitrario e fixo: o que importa e que todas as execucoes usem o
 * mesmo. Nao derivar de hash de texto para nao mudar sem ninguem perceber.
 */
const TRAVA_DE_MIGRATION = 8_452_301

export type Migration = {
  readonly version: string
  readonly sql: string
  readonly checksum: string
}

export type MigrationResult = {
  readonly aplicadas: readonly string[]
  readonly jaEstavam: readonly string[]
}

const somaDe = (conteudo: string): string =>
  createHash('sha256').update(conteudo, 'utf8').digest('hex').slice(0, 16)

/** Le as migrations do disco, em ordem de nome. */
export function lerMigrations(pasta = PASTA): readonly Migration[] {
  return readdirSync(pasta)
    .filter((nome) => nome.endsWith('.sql'))
    .sort()
    .map((nome) => {
      /* Normaliza CRLF: senao o checksum muda conforme o sistema de quem
         clonou, e uma migration ja aplicada parece ter sido editada. */
      const sql = readFileSync(join(pasta, nome), 'utf8').replaceAll('\r\n', '\n')
      return { version: nome.replace(/\.sql$/, ''), sql, checksum: somaDe(sql) }
    })
}

/**
 * Aplica o que falta e devolve o que fez.
 *
 * Idempotente: rodar duas vezes nao reaplica nada. E **recusa** rodar se uma
 * migration ja aplicada tiver mudado de conteudo — banco que aplicou uma versao
 * do arquivo e disco que tem outra e a origem de "funciona na minha maquina"
 * na sua forma mais caro de depurar.
 */
export async function migrate(url: string, pasta = PASTA): Promise<MigrationResult> {
  const migrations = lerMigrations(pasta)
  if (migrations.length === 0) return { aplicadas: [], jaEstavam: [] }

  const sql = postgres(url, { max: 1, onnotice: () => {} })

  try {
    /*
     * Trava de aplicacao: so uma execucao aplica migration por vez. As outras
     * esperam aqui e, quando entram, ja encontram tudo aplicado.
     *
     * Nao e precaucao teorica. Sem ela, tres arquivos de teste rodando em
     * paralelo chamaram `migrate()` ao mesmo tempo e o Postgres respondeu
     * `duplicate key value violates unique constraint
     * "pg_type_typname_nsp_index"` — dois `CREATE TABLE` da mesma tabela em
     * sessoes diferentes colidem no catalogo, porque criar tabela cria um tipo
     * com o mesmo nome. O mesmo vale em producao com duas instancias subindo
     * juntas, que e o caso normal em deploy.
     *
     * `pg_advisory_lock` e de SESSAO, nao de transacao: a trava precisa
     * sobreviver as varias transacoes do laco abaixo. Por isso o unlock no
     * `finally` — e por isso `max: 1`, para trava e unlock cairem na mesma
     * conexao.
     */
    await sql`SELECT pg_advisory_lock(${TRAVA_DE_MIGRATION})`

    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `

    const registradas = new Map<string, string>(
      (
        await sql<{ version: string; checksum: string }[]>`
        SELECT version, checksum FROM schema_migrations
      `
      ).map((r) => [r.version, r.checksum]),
    )

    const aplicadas: string[] = []
    const jaEstavam: string[] = []

    for (const m of migrations) {
      const registrada = registradas.get(m.version)

      if (registrada !== undefined) {
        if (registrada !== m.checksum) {
          throw new Error(
            `A migration ${m.version} foi aplicada com outro conteudo (${registrada} no banco, ` +
              `${m.checksum} no disco). Migration aplicada e imutavel: crie uma nova.`,
          )
        }
        jaEstavam.push(m.version)
        continue
      }

      /*
       * Uma transacao por migration. Nao uma transacao para todas: se a
       * terceira falha, as duas primeiras ja estao aplicadas e registradas, e
       * a proxima execucao continua de onde parou. Envolver tudo numa
       * transacao so faria a correcao de uma migration exigir reaplicar as
       * anteriores.
       */
      await sql.begin(async (tx) => {
        /*
         * `.simple()` e obrigatorio, nao otimizacao. Por padrao o driver usa o
         * protocolo estendido, que aceita UM comando por requisicao — e um
         * arquivo de migration tem varios (aqui, duas funcoes e dois
         * comentarios). Sem isto, a primeira migration falha com "cannot
         * insert multiple commands into a prepared statement".
         *
         * O protocolo simples nao aceita parametro, e por isso o SQL de
         * migration nao tem nenhum: valor que varia nao pertence a migration.
         */
        await tx.unsafe(m.sql).simple()
        await tx`
          INSERT INTO schema_migrations (version, checksum) VALUES (${m.version}, ${m.checksum})
        `
      })

      aplicadas.push(m.version)
    }

    return { aplicadas, jaEstavam }
  } finally {
    /* Solta a trava antes de fechar. Fechar a conexao ja soltaria, mas
       depender disso torna o unlock invisivel para quem le. */
    await sql`SELECT pg_advisory_unlock(${TRAVA_DE_MIGRATION})`.catch(() => undefined)
    await sql.end({ timeout: 5 })
  }
}
