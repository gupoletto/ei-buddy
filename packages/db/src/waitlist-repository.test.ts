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
