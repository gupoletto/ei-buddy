import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { createCompanyRepository } from './registration-repositories.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * O cadastro da propria loja sob RLS — NR-072, RF-003.
 *
 * Duas coisas que so o banco decide: que a atualizacao PARCIAL nao apaga o que
 * nao veio, e que a leitura sem `WHERE` ve exatamente uma linha — a do proprio
 * tenant.
 *
 * A segunda so pode ser provada em conexao de papel COMUM. Na do dono o
 * `SELECT * FROM companies` devolveria todas as lojas do banco, e o repositorio
 * — que confia na politica raiz em vez de repetir o filtro — pareceria
 * quebrado. Aqui ele e exercitado como em producao.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('cadastro da empresa — NR-072', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresa: string
  let outraEmpresa: string
  let usuario: string

  let repo: ReturnType<typeof createCompanyRepository>

  const criar = async (semente: string, nome: string) => {
    const cnpj = cnpjDeTeste(semente)
    return repo.create({
      legalName: nome,
      cnpj,
      email: `${semente}@${cnpj}.local`,
      phone: '41999990000',
      createdAt: new Date('2026-09-07T12:00:00.000Z'),
    })
  }

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0002_dominio_0909')

    admin = postgres(DATABASE_URL!, { max: 4, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    repo = createCompanyRepository(sql)

    empresa = (await criar('7', 'Mercearia do Cadastro')).id
    outraEmpresa = (await criar('9', 'Loja da Esquina')).id

    usuario = randomUUID()
    await admin`
      INSERT INTO users (id, name, email) VALUES (${usuario}, 'Dona', ${`m${usuario}@local`})
    `
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    /* Sem limpar `accounts`: quem semeia o plano de contas e `registerCompany`
       em `core`, e aqui o repositorio e chamado direto. */
    for (const id of [empresa, outraEmpresa].filter(Boolean)) {
      await withTenant(sql, id, (tx) => tx`DELETE FROM companies`)
    }
    await admin`DELETE FROM users WHERE id = ${usuario}`
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  it('le a propria empresa sem `WHERE id` — quem filtra e a politica raiz', async () => {
    const lida = await repo.findById(empresa)

    expect(lida?.legalName).toBe('Mercearia do Cadastro')
  })

  /*
   * A guarda do arquivo. O repositorio faz `SELECT * FROM companies` sem
   * filtro: se esta assercao parar de valer, ele passa a devolver a primeira
   * empresa que aparecer, que pode ser a do vizinho.
   */
  it('a leitura sem filtro enxerga UMA linha, e nao o banco inteiro', async () => {
    const todas = await withTenant(
      sql,
      empresa,
      (tx) => tx<{ total: string }[]>`SELECT count(*)::text AS total FROM companies`,
    )

    expect(todas[0]?.total).toBe('1')
  })

  it('a empresa da outra loja e invisivel daqui', async () => {
    /* Existe: lida pelo proprio tenant, aparece. */
    expect((await repo.findById(outraEmpresa))?.legalName).toBe('Loja da Esquina')

    /* E some quando o contexto e o desta loja — a politica raiz devolve a
       linha DELA, e nao a que foi pedida. */
    const daqui = await repo.findById(empresa)
    expect(daqui?.legalName).toBe('Mercearia do Cadastro')
  })

  it('grava as inscricoes e o ramo de atividade', async () => {
    const atualizada = await repo.update(empresa, {
      stateRegistration: '9076288293',
      municipalRegistration: '112233',
      businessSegment: 'Mercearia e minimercado',
    })

    expect(atualizada.stateRegistration).toBe('9076288293')
    /* Texto corrente, e nao codigo: e o que a tela oferece e o lojista sabe
       responder. O CNAE e do contador, e entra quando houver quem o informe. */
    expect(atualizada.businessSegment).toBe('Mercearia e minimercado')
  })

  /*
   * O defeito que o `COALESCE` evita: com um UPDATE que grava tudo, salvar a
   * aba de endereco limparia a inscricao estadual da aba fiscal.
   */
  it('atualizar so o endereco NAO apaga a inscricao estadual', async () => {
    await repo.update(empresa, { stateRegistration: 'ISENTO' })

    await repo.update(empresa, { address: { city: 'Curitiba', state: 'PR' } })

    const lida = await repo.findById(empresa)
    expect(lida?.address.city).toBe('Curitiba')
    expect(lida?.stateRegistration).toBe('ISENTO')
  })

  it('atualizar so o CEP nao limpa cidade e UF', async () => {
    await repo.update(empresa, { address: { city: 'Curitiba', state: 'PR' } })

    await repo.update(empresa, { address: { zipCode: '80010000' } })

    const lida = await repo.findById(empresa)
    expect(lida?.address.zipCode).toBe('80010000')
    expect(lida?.address.city).toBe('Curitiba')
  })

  it('mexe o updated_at, que tem DEFAULT e nao vale em UPDATE', async () => {
    const [antes] = await withTenant(
      sql,
      empresa,
      (tx) => tx<{ updated_at: Date }[]>`SELECT updated_at FROM companies`,
    )

    await repo.update(empresa, { tradeName: 'Mercearia Sol' })

    const [depois] = await withTenant(
      sql,
      empresa,
      (tx) => tx<{ updated_at: Date }[]>`SELECT updated_at FROM companies`,
    )

    /* Sem o `updated_at = now()` explicito, a data ficaria congelada no dia do
       cadastro: o DEFAULT so vale no INSERT. */
    expect(depois!.updated_at.getTime()).toBeGreaterThan(antes!.updated_at.getTime())
  })

  it('recusa ramo de atividade longo demais', async () => {
    /* O CHECK e a ultima linha de defesa: a importacao e o WhatsApp entram por
       fora do contrato, e o banco e o unico ponto por onde todos passam. */
    await expect(repo.update(empresa, { businessSegment: 'x'.repeat(81) })).rejects.toThrow(
      /violates check constraint/i,
    )
  })

  it('aceita "ISENTO" como inscricao estadual — e valor legitimo', async () => {
    const atualizada = await repo.update(empresa, { stateRegistration: 'ISENTO' })

    expect(atualizada.stateRegistration).toBe('ISENTO')
  })
})
