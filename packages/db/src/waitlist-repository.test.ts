import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { createWaitlistRepository } from './waitlist-repository.js'

/**
 * Lista de espera do pre-lancamento, contra Postgres real — NR-111.
 *
 * O que so o banco prova: que `pain_points` (array) ida e volta sem perder
 * ordem nem virar string, e que `created_at` (timestamptz, e nao `date`) nao
 * tem o recuo de um dia que `RETURNING` teria se fosse coluna `date` — por
 * isso o teste confere o ANO-MES-DIA da resposta, e nao so que "existe uma
 * data".
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('lista de espera — NR-111', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let repo: ReturnType<typeof createWaitlistRepository>

  beforeAll(async () => {
    await migrate(MIGRATION_URL!)

    admin = postgres(DATABASE_URL!, { max: 4, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql
    repo = createWaitlistRepository(sql)
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    await admin`DELETE FROM waitlist_entries`
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  const base = {
    name: 'Maria Souza',
    businessType: null,
    phone: '41998765432',
    expectation: 'Queria saber o que vendi no dia sem abrir planilha.',
    painPoints: [],
    painPointOther: null,
    usesSystem: null,
    usesSystemOther: null,
    fairPrice: null,
    wantsUpdates: true,
    createdAt: new Date('2026-09-13T09:00:00.000Z'),
  }

  it('grava e devolve com id gerado', async () => {
    const r = await repo.insert(base)

    expect(r.id).toBeTruthy()
    expect(r.name).toBe('Maria Souza')
    expect(r.createdAt.slice(0, 10)).toBe('2026-09-13')
  })

  it('o array de dificuldades ida e volta na mesma ordem', async () => {
    const r = await repo.insert({
      ...base,
      painPoints: ['cash_flow', 'other'] as const,
      painPointOther: 'Achar tempo para tudo',
    })

    expect(r.painPoints).toEqual(['cash_flow', 'other'])
    expect(r.painPointOther).toBe('Achar tempo para tudo')
  })

  it('sem dificuldade nenhuma volta lista vazia, e nao nula', async () => {
    const r = await repo.insert(base)

    expect(r.painPoints).toEqual([])
  })

  it('ramo, sistema e valor justo nulos continuam nulos na leitura', async () => {
    const r = await repo.insert(base)

    expect(r.businessType).toBeNull()
    expect(r.usesSystem).toBeNull()
    expect(r.fairPrice).toBeNull()
  })

  it('duas pessoas diferentes viram duas linhas — sem unicidade por telefone', async () => {
    await repo.insert(base)
    await repo.insert({ ...base, name: 'Joao Lima', phone: '41988887777' })

    const [linha] = await admin<{ total: string }[]>`
      SELECT count(*)::text AS total FROM waitlist_entries WHERE phone IN ('41998765432', '41988887777')
    `
    expect(Number(linha!.total)).toBeGreaterThanOrEqual(2)
  })
})

describe.skipIf(!DATABASE_URL)('painel do Super Admin — lista e agregados', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let repo: ReturnType<typeof createWaitlistRepository>

  const base = {
    name: 'Maria Souza',
    businessType: null,
    phone: '41998765432',
    expectation: 'Queria saber o que vendi no dia sem abrir planilha.',
    painPoints: [] as const,
    painPointOther: null,
    usesSystem: null,
    usesSystemOther: null,
    fairPrice: null,
    wantsUpdates: true,
    createdAt: new Date('2026-09-12T09:00:00.000Z'),
  }

  beforeAll(async () => {
    await migrate(MIGRATION_URL!)

    admin = postgres(DATABASE_URL!, { max: 4, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql
    repo = createWaitlistRepository(sql)

    await repo.insert({
      ...base,
      name: 'Maria Souza',
      painPoints: ['cash_flow', 'marketing'],
      usesSystem: 'complicated',
      fairPrice: 'up_to_29',
      createdAt: new Date('2026-09-12T09:00:00.000Z'),
    })
    await repo.insert({
      ...base,
      name: 'Joao Lima',
      phone: '41988887777',
      painPoints: ['cash_flow'],
      usesSystem: 'complicated',
      fairPrice: 'from_30_to_49',
      createdAt: new Date('2026-09-12T20:00:00.000Z'),
    })
    await repo.insert({
      ...base,
      name: 'Ana Paula',
      phone: '41977776666',
      businessType: 'Salao de beleza',
      createdAt: new Date('2026-09-13T09:00:00.000Z'),
    })
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    await admin`DELETE FROM waitlist_entries`
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  describe('list', () => {
    it('devolve a pagina com o total, mais nova primeiro', async () => {
      const r = await repo.list({ offset: 0, limite: 2 })

      expect(r.total).toBe(3)
      expect(r.entries.map((e) => e.name)).toEqual(['Ana Paula', 'Joao Lima'])
    })

    it('busca por nome estreita o total', async () => {
      const r = await repo.list({ termo: 'maria', offset: 0, limite: 20 })

      expect(r.total).toBe(1)
      expect(r.entries[0]!.name).toBe('Maria Souza')
    })

    it('busca por ramo tambem encontra', async () => {
      const r = await repo.list({ termo: 'salao', offset: 0, limite: 20 })

      expect(r.entries.map((e) => e.name)).toEqual(['Ana Paula'])
    })

    it('busca por telefone tambem encontra', async () => {
      const r = await repo.list({ termo: '41988887777', offset: 0, limite: 20 })

      expect(r.entries.map((e) => e.name)).toEqual(['Joao Lima'])
    })

    it('sem termo nenhum, devolve tudo', async () => {
      const r = await repo.list({ offset: 0, limite: 20 })

      expect(r.total).toBe(3)
    })
  })

  describe('stats', () => {
    it('agrega dificuldade por contagem, maior primeiro', async () => {
      const r = await repo.stats()

      expect(r.total).toBe(3)
      expect(r.painPoints).toEqual([
        { value: 'cash_flow', count: 2 },
        { value: 'marketing', count: 1 },
      ])
    })

    it('agrega sistema e valor justo, ignorando quem nao respondeu', async () => {
      const r = await repo.stats()

      expect(r.usesSystem).toEqual([{ value: 'complicated', count: 2 }])
      expect(r.fairPrice).toEqual(
        expect.arrayContaining([
          { value: 'up_to_29', count: 1 },
          { value: 'from_30_to_49', count: 1 },
        ]),
      )
    })

    it('agrupa por dia, em ordem crescente', async () => {
      const r = await repo.stats()

      expect(r.perDay).toEqual([
        { date: '2026-09-12', count: 2 },
        { date: '2026-09-13', count: 1 },
      ])
    })
  })
})
