import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertRlsEnforced, checkRlsEnforcement } from './rls-guard.js'
import { migrate } from './migrate.js'
import { conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withPlatformScope, withTenant } from './tenant.js'

/**
 * A verificacao da RNF-021: "teste automatizado que tenta ler dados de outro
 * `company_id` e falha".
 *
 * Roda contra Postgres de verdade, e nao contra banco fingido, porque e
 * exatamente o que banco fingido nao tem: politica de RLS, papel, transacao e
 * variavel de sessao. Um mock aqui provaria que o mock funciona.
 *
 * Sem `DATABASE_URL` a suite e pulada com motivo — quem clonou o repo e nao
 * subiu a infra nao deveria ver falha vermelha. **Com** `DATABASE_URL` definida
 * e banco inalcancavel, ela FALHA: na CI a variavel esta sempre definida, e
 * pular ali significaria um portao que nao guarda nada.
 *
 * As asserções rodam com um papel COMUM, criado aqui, e nao com a conexao de
 * administrador. A primeira versao desta suite usava a conexao de
 * administrador e a CI reprovou mostrando linhas de duas empresas onde deveria
 * haver uma: na CI a aplicacao usa o `POSTGRES_USER` do contedor, que e
 * superusuario — e superusuario ignora RLS inteiramente, `FORCE` inclusive.
 * Com a conexao errada, esta suite mediria o vazio.
 */

const DATABASE_URL = process.env.DATABASE_URL
/*
 * Sem papel separado (o caso da CI), a URL de migration e a mesma da
 * aplicacao. Isso e aceitavel para a migration em si — ela nao precisa de
 * BYPASSRLS para criar funcao.
 *
 * Uma versao anterior deste comentario dizia que "o FORCE RLS mantem o teste
 * honesto nesse cenario". Estava errado, e a CI provou: FORCE cobre o DONO da
 * tabela e nao cobre superusuario. As asserções passaram a rodar por um papel
 * comum justamente por isso.
 */
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

const EMPRESA_A = '11111111-1111-4111-8111-111111111111'
const EMPRESA_B = '22222222-2222-4222-8222-222222222222'

/** Tabela do teste, nao do dominio: as de negocio nascem na NR-008 e NR-020. */
const TABELA = 'nr007_isolamento'

describe.skipIf(!DATABASE_URL)('isolamento entre empresas — RNF-021, RF-121, RF-122', () => {
  /** Conexao de administrador: cria tabela, papel e concessoes. */
  let admin: Sql
  /** Conexao da aplicacao, com papel comum — e nela que o isolamento vale. */
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let idDeA: string
  let idDeB: string

  beforeAll(async () => {
    const resultado = await migrate(MIGRATION_URL!)
    /* Se a migration nao rodou, nada abaixo faz sentido — falhar aqui e mais
       claro que dezenove erros de "funcao current_company_id nao existe". */
    const todas = [...resultado.aplicadas, ...resultado.jaEstavam]
    expect(todas).toContain('0001_tenant_isolation')
    expect(todas).toContain('0004_sessao')

    admin = postgres(DATABASE_URL!, { max: 3, onnotice: () => {} })

    await admin.unsafe(`DROP TABLE IF EXISTS ${TABELA}`)
    await admin.unsafe(`
      CREATE TABLE ${TABELA} (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL,
        rotulo     text NOT NULL
      )
    `)
    await admin.unsafe(`SELECT enable_tenant_isolation('${TABELA}')`)

    /* Depois da tabela existir: as concessoes cobrem o que ja esta la. */
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    /* A propria semeadura ja depende do isolamento: com FORCE RLS e WITH CHECK,
       nao existe insert sem tenant definido. */
    idDeA = await inserir(EMPRESA_A, 'venda da loja A')
    idDeB = await inserir(EMPRESA_B, 'venda da loja B')
  }, 60_000)

  afterAll(async () => {
    if (aplicacao) await aplicacao.encerrar()
    if (!admin) return
    await admin.unsafe(`DROP TABLE IF EXISTS ${TABELA}`)
    await admin.end({ timeout: 5 })
  })

  it('a conexao sob teste nao pode escapar da politica', async () => {
    /*
     * O teste que faltava. Sem ele, a suite inteira pode passar a medir o
     * vazio no dia em que alguem apontar `DATABASE_URL` para um superusuario —
     * que foi exatamente o que aconteceu na CI.
     */
    const status = await checkRlsEnforcement(sql)
    expect(status.isSuperuser).toBe(false)
    expect(status.bypassesRls).toBe(false)
    await expect(assertRlsEnforced(sql)).resolves.toMatchObject({ enforced: true })
  })

  it('a conexao de administrador da CI ESCAPA da politica, e o guarda avisa', async () => {
    const status = await checkRlsEnforcement(admin)

    /*
     * Nao e sempre verdade — depende de como o ambiente foi montado. Quando
     * for, `assertRlsEnforced` tem de recusar: e o que impede a aplicacao de
     * subir com o isolamento desligado sem que nada avise.
     */
    if (status.enforced) {
      await expect(assertRlsEnforced(admin)).resolves.toMatchObject({ enforced: true })
      return
    }
    await expect(assertRlsEnforced(admin)).rejects.toThrow(/IGNORA as politicas de RLS/)
  })

  async function inserir(empresa: string, rotulo: string): Promise<string> {
    const [linha] = await withTenant(sql, empresa, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `INSERT INTO ${TABELA} (company_id, rotulo) VALUES ($1, $2) RETURNING id`,
        [empresa, rotulo],
      ),
    )
    return linha!.id
  }

  it('a politica esta ligada e forcada na tabela', async () => {
    const [t] = await sql<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ${TABELA}
    `
    expect(t?.relrowsecurity).toBe(true)
    /* Sem FORCE, o dono da tabela ignora a politica — e a aplicacao costuma
       conectar com o papel que criou as tabelas. O isolamento existiria no
       papel e nao na pratica. */
    expect(t?.relforcerowsecurity).toBe(true)
  })

  it('cada empresa le apenas as proprias linhas', async () => {
    const deA = await withTenant(sql, EMPRESA_A, (tx) =>
      tx.unsafe<{ rotulo: string }[]>(`SELECT rotulo FROM ${TABELA}`),
    )
    const deB = await withTenant(sql, EMPRESA_B, (tx) =>
      tx.unsafe<{ rotulo: string }[]>(`SELECT rotulo FROM ${TABELA}`),
    )

    expect(deA.map((r) => r.rotulo)).toEqual(['venda da loja A'])
    expect(deB.map((r) => r.rotulo)).toEqual(['venda da loja B'])
  })

  it('linha de outra empresa responde como inexistente, nao como proibida', async () => {
    const achou = await withTenant(sql, EMPRESA_B, (tx) =>
      tx.unsafe<{ id: string }[]>(`SELECT id FROM ${TABELA} WHERE id = $1`, [idDeA]),
    )

    /*
     * Zero linhas, e nao erro de permissao — RF-122. A diferenca importa: um
     * "proibido" confirmaria que o id existe, e id vazado e id que alguem
     * tenta de novo em outro endpoint.
     */
    expect(achou).toEqual([])
  })

  it('consulta sem empresa no contexto FALHA', async () => {
    /*
     * O coracao da RF-121: vazio pareceria resposta, e alguem concluiria que a
     * loja nao vendeu nada hoje.
     *
     * A mensagem casada e a NOSSA, e nao a do Postgres, e isso importa. A
     * primeira versao apostava no erro do proprio `current_setting`, que so
     * acontece na primeira vez: depois de a variavel ser definida na sessao,
     * le-la devolve string vazia, e a consulta passava a falhar no cast para
     * uuid — com a mensagem `invalid input syntax for type uuid: ""`, que nao
     * diz nada sobre tenant faltando. Ver migration 0004.
     */
    await expect(
      withPlatformScope(sql, (tx) => tx.unsafe(`SELECT * FROM ${TABELA}`)),
    ).rejects.toThrow(/sem empresa no contexto/i)
  })

  it('nao grava linha no company_id de outra empresa', async () => {
    /* WITH CHECK. Sem ele, ler errado seria vazamento; gravar errado seria
       vazamento que fica no banco. */
    await expect(
      withTenant(sql, EMPRESA_A, (tx) =>
        tx.unsafe(`INSERT INTO ${TABELA} (company_id, rotulo) VALUES ($1, $2)`, [
          EMPRESA_B,
          'linha plantada na loja B',
        ]),
      ),
    ).rejects.toThrow(/row-level security|violates/i)
  })

  it('nao move linha existente para outra empresa', async () => {
    await expect(
      withTenant(sql, EMPRESA_A, (tx) =>
        tx.unsafe(`UPDATE ${TABELA} SET company_id = $1 WHERE id = $2`, [EMPRESA_B, idDeA]),
      ),
    ).rejects.toThrow(/row-level security|violates/i)
  })

  it('nao altera linha de outra empresa', async () => {
    const alteradas = await withTenant(sql, EMPRESA_A, (tx) =>
      tx.unsafe(`UPDATE ${TABELA} SET rotulo = 'alterado por A' WHERE id = $1`, [idDeB]),
    )

    /* Zero linhas afetadas, sem erro: para A, a linha de B nao existe. */
    expect(alteradas.count).toBe(0)

    const [linha] = await withTenant(sql, EMPRESA_B, (tx) =>
      tx.unsafe<{ rotulo: string }[]>(`SELECT rotulo FROM ${TABELA} WHERE id = $1`, [idDeB]),
    )
    expect(linha?.rotulo).toBe('venda da loja B')
  })

  it('nao apaga linha de outra empresa', async () => {
    const apagadas = await withTenant(sql, EMPRESA_A, (tx) =>
      tx.unsafe(`DELETE FROM ${TABELA} WHERE id = $1`, [idDeB]),
    )
    expect(apagadas.count).toBe(0)
  })

  it('o tenant nao vaza da transacao para a conexao do pool', async () => {
    /*
     * O vazamento mais facil de escrever e o mais dificil de notar. Se o
     * `set_config` fosse de sessao em vez de local a transacao, a conexao
     * voltaria ao pool com a empresa anterior definida — e a proxima
     * requisicao, de outra loja, leria os dados da errada. So aparece sob
     * concorrencia, que e quando ninguem esta olhando.
     */
    await withTenant(sql, EMPRESA_A, (tx) => tx.unsafe(`SELECT 1`))

    await expect(
      withPlatformScope(sql, (tx) => tx.unsafe(`SELECT * FROM ${TABELA}`)),
    ).rejects.toThrow(/sem empresa no contexto/i)
  })

  it('recusa isolar tabela sem company_id, em vez de aceitar em silencio', async () => {
    /* DDL e do administrador: a aplicacao nao cria tabela, e nem deveria. */
    await admin.unsafe(`DROP TABLE IF EXISTS nr007_sem_tenant`)
    await admin.unsafe(`CREATE TABLE nr007_sem_tenant (id uuid PRIMARY KEY, rotulo text)`)

    try {
      /* Ligar RLS numa tabela sem a coluna passaria, e a politica falharia so
         na primeira consulta em producao. */
      await expect(
        admin.unsafe(`SELECT enable_tenant_isolation('nr007_sem_tenant')`),
      ).rejects.toThrow(/company_id/)
    } finally {
      await admin.unsafe(`DROP TABLE IF EXISTS nr007_sem_tenant`)
    }
  })

  it('a mesma migration aplicada duas vezes nao faz nada na segunda', async () => {
    const segunda = await migrate(MIGRATION_URL!)
    expect(segunda.aplicadas).toEqual([])
    expect(segunda.jaEstavam).toContain('0001_tenant_isolation')
  })
})

describe.skipIf(DATABASE_URL)('isolamento entre empresas', () => {
  it.skip('pulado: defina DATABASE_URL e rode `pnpm infra:up` para verificar a RNF-021', () => {})
})
