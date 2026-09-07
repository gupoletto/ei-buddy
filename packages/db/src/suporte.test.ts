import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { createSupportRepository } from './support-repository.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * Chamados de suporte — NR-080, US-062.
 *
 * O que se prova aqui e o que so o banco prova: que as nao lidas sao CONTADAS
 * e nao guardadas, que marcar lido nao anda para tras, que a resposta do
 * lojista reabre o chamado, que o protocolo e unico, e que nada disso enxerga a
 * loja do lado.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('suporte — NR-080', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresaA: string
  let empresaB: string
  let usuario: string

  let repo: ReturnType<typeof createSupportRepository>

  const AGORA = new Date('2026-09-07T12:00:00.000Z')

  async function criarEmpresa(cnpj: string, nome: string): Promise<string> {
    const id = randomUUID()
    await withTenant(
      sql,
      id,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${id}, ${nome}, ${cnpj}, ${`s@${cnpj}.local`}, '41999990000')
      `,
    )
    return id
  }

  const abrir = (empresa: string, assunto: string, quando = AGORA) =>
    repo.open({
      companyId: empresa,
      subject: assunto,
      category: 'tecnico',
      body: 'Descricao do que aconteceu, com detalhe suficiente.',
      attachment: null,
      authorName: 'Dona Marina',
      createdBy: usuario,
      createdAt: quando,
    })

  /** Uma resposta do SUPORTE, que so o painel externo escreve. */
  async function responderComoSuporte(empresa: string, ticketId: string, quando: Date) {
    await withTenant(
      sql,
      empresa,
      (tx) => tx`
        INSERT INTO support_messages
          (company_id, ticket_id, author, author_name, body, created_at)
        VALUES (${empresa}, ${ticketId}, 'suporte', 'Equipe', 'Ja estamos vendo.', ${quando})
      `,
    )
  }

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0018_suporte')

    admin = postgres(DATABASE_URL!, { max: 4, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    empresaA = await criarEmpresa(cnpjDeTeste('1'), 'Loja Suporte A')
    empresaB = await criarEmpresa(cnpjDeTeste('7'), 'Loja Suporte B')

    usuario = randomUUID()
    await admin`
      INSERT INTO users (id, name, email) VALUES (${usuario}, 'Dona', ${`s${usuario}@local`})
    `

    repo = createSupportRepository(sql)
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    for (const empresa of [empresaA, empresaB].filter(Boolean)) {
      await withTenant(sql, empresa, async (tx) => {
        await tx`DELETE FROM support_messages`
        await tx`DELETE FROM support_tickets`
        await tx`DELETE FROM companies`
      })
    }
    await admin`DELETE FROM users WHERE id = ${usuario}`
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  describe('abrir', () => {
    it('grava o chamado e a primeira mensagem juntos', async () => {
      const c = await abrir(empresaA, 'Nota saiu com CFOP errado')

      expect(c.subject).toBe('Nota saiu com CFOP errado')
      /* Chamado sem mensagem seria um assunto sem conteudo: a equipe abriria o
         detalhe e nao teria o que ler. */
      expect(c.messages).toHaveLength(1)
      expect(c.messages[0]?.author).toBe('cliente')
      expect(c.messages[0]?.authorName).toBe('Dona Marina')
    })

    it('o protocolo leva o ano do chamado, e nao o de agora', async () => {
      const reveillon = new Date('2026-12-31T23:59:00.000Z')

      const c = await abrir(empresaA, 'Aberto na virada', reveillon)

      /* Se o ano viesse de `now()`, um chamado das 23h59 de 31 de dezembro
         receberia protocolo do ano seguinte. */
      expect(c.protocol.startsWith('2026-')).toBe(true)
    })

    it('protocolo nao se repete entre lojas diferentes', async () => {
      const a = await abrir(empresaA, 'Um chamado da loja A')
      const b = await abrir(empresaB, 'Um chamado da loja B')

      /* Unico GLOBAL: e o numero que a pessoa fala ao telefone, e a equipe
         precisa achar o chamado sem perguntar de qual loja e. */
      expect(a.protocol).not.toBe(b.protocol)
    })

    it('chamado novo nasce sem nao lidas', async () => {
      const c = await abrir(empresaA, 'Recem aberto')

      /* A propria mensagem do lojista nao conta: nao lida e resposta do
         SUPORTE que ele ainda nao viu. */
      expect(c.unread).toBe(0)
    })
  })

  describe('nao lidas — contadas, nunca guardadas', () => {
    it('conta as respostas do suporte quando nunca se abriu o detalhe', async () => {
      const c = await abrir(empresaA, 'Duas respostas')
      await responderComoSuporte(empresaA, c.id, new Date('2026-09-07T13:00:00.000Z'))
      await responderComoSuporte(empresaA, c.id, new Date('2026-09-07T14:00:00.000Z'))

      const depois = await repo.findById(empresaA, c.id)

      expect(depois?.unread).toBe(2)
    })

    it('marcar lido zera, e a resposta seguinte volta a contar', async () => {
      const c = await abrir(empresaA, 'Lido e depois nova resposta')
      await responderComoSuporte(empresaA, c.id, new Date('2026-09-07T13:00:00.000Z'))

      await repo.markRead(empresaA, c.id, new Date('2026-09-07T13:30:00.000Z'))
      expect((await repo.findById(empresaA, c.id))?.unread).toBe(0)

      await responderComoSuporte(empresaA, c.id, new Date('2026-09-07T15:00:00.000Z'))
      expect((await repo.findById(empresaA, c.id))?.unread).toBe(1)
    })

    it('marcar lido NAO anda para tras', async () => {
      const c = await abrir(empresaA, 'Duas abas abertas')
      await responderComoSuporte(empresaA, c.id, new Date('2026-09-07T13:00:00.000Z'))

      await repo.markRead(empresaA, c.id, new Date('2026-09-07T16:00:00.000Z'))
      /*
       * A segunda aba foi carregada ANTES e marca com um carimbo mais velho.
       * Sem `GREATEST`, ela faria o badge ressuscitar mensagens que a pessoa ja
       * tinha visto.
       */
      await repo.markRead(empresaA, c.id, new Date('2026-09-07T12:30:00.000Z'))

      expect((await repo.findById(empresaA, c.id))?.unread).toBe(0)
    })

    it('ler nao joga o chamado para o topo da lista', async () => {
      const c = await abrir(empresaA, 'Nao deve subir por leitura')
      const antes = (await repo.findById(empresaA, c.id))?.updatedAt

      await repo.markRead(empresaA, c.id, new Date('2026-09-08T10:00:00.000Z'))

      /* Ler nao e atividade no chamado. Mexer em `updated_at` faria a lista
         reordenar toda vez que alguem abrisse um chamado antigo. */
      expect((await repo.findById(empresaA, c.id))?.updatedAt).toBe(antes)
    })
  })

  describe('responder', () => {
    it('a resposta do lojista reabre o chamado', async () => {
      const c = await abrir(empresaA, 'Precisa reabrir')
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`UPDATE support_tickets SET status = 'encerrado' WHERE id = ${c.id}`,
      )

      const depois = await repo.reply({
        companyId: empresaA,
        ticketId: c.id,
        body: 'O problema voltou.',
        attachment: null,
        authorName: 'Dona Marina',
        createdAt: new Date('2026-09-08T09:00:00.000Z'),
      })

      /* Chamado encerrado em que o cliente escreve esta dizendo que o problema
         voltou. Obriga-lo a abrir outro perderia o historico que explica o caso. */
      expect(depois?.status).toBe('andamento')
      expect(depois?.messages).toHaveLength(2)
    })

    it('responder chamado que nao existe volta indefinido, e nao erro', async () => {
      const r = await repo.reply({
        companyId: empresaA,
        ticketId: randomUUID(),
        body: 'Ninguem vai ler.',
        attachment: null,
        authorName: 'Dona Marina',
        createdAt: AGORA,
      })

      expect(r).toBeUndefined()
    })
  })

  describe('isolamento', () => {
    it('nao enxerga o chamado da outra loja', async () => {
      const daOutra = await abrir(empresaB, 'Chamado da loja B')

      expect(await repo.findById(empresaA, daOutra.id)).toBeUndefined()
      expect((await repo.list(empresaA)).map((t) => t.id)).not.toContain(daOutra.id)
    })

    it('nao responde no chamado da outra loja', async () => {
      const daOutra = await abrir(empresaB, 'Tambem da loja B')

      const r = await repo.reply({
        companyId: empresaA,
        ticketId: daOutra.id,
        body: 'Nao deveria entrar.',
        attachment: null,
        authorName: 'Invasora',
        createdAt: AGORA,
      })

      expect(r).toBeUndefined()
    })
  })
})
