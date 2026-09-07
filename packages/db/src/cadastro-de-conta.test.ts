import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { createCompanyRepository } from './registration-repositories.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withPlatformScope, withTenant } from './tenant.js'

/**
 * O cadastro de conta sob RLS — NR-014, RF-002, RF-121.
 *
 * ## Por que este arquivo existe
 *
 * O cadastro estava QUEBRADO para qualquer conexao de verdade, e nenhum teste
 * pegava. `cnpjTaken` consultava `companies` sem empresa no contexto — o que e
 * inevitavel, porque descobrir se a empresa existe e justamente o que se esta
 * fazendo — e consulta sem contexto LANCA desde a 0004, de proposito.
 *
 * O E2E nao pegou porque roda com a conexao do DONO do banco, e dono e
 * superusuario: a politica de RLS nunca chega a ser avaliada, entao a consulta
 * passava. O teste ficava verde e o lojista via "algo deu errado do nosso lado"
 * ao tentar criar conta.
 *
 * Aqui a conexao e de um papel COMUM (`conectarComoAplicacao`), sujeito a RLS
 * como em producao. E o unico lugar onde este defeito podia ter sido visto.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('cadastro de conta sob RLS — NR-014', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresa: string
  let cnpj: string

  let repo: ReturnType<typeof createCompanyRepository>

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0017_cnpj_no_cadastro_de_conta')

    admin = postgres(DATABASE_URL!, { max: 4, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    repo = createCompanyRepository(sql)

    cnpj = cnpjDeTeste('2')
    empresa = randomUUID()
    await withTenant(
      sql,
      empresa,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${empresa}, 'Loja do Cadastro', ${cnpj}, ${`c@${cnpj}.local`}, '41999990000')
      `,
    )
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    await withTenant(sql, empresa, (tx) => tx`DELETE FROM companies`)
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  it('a conexao do teste esta MESMO sujeita a RLS', async () => {
    /*
     * A guarda deste arquivo inteiro. Se esta assercao parar de valer, todas as
     * outras passam a medir o vazio — que foi exatamente o que aconteceu no
     * E2E, e o motivo de o defeito ter chegado ao usuario.
     */
    await expect(
      withPlatformScope(sql, (tx) => tx`SELECT count(*) FROM companies`),
    ).rejects.toThrow(/app\.company_id/)
  })

  it('acha o CNPJ ja cadastrado sem empresa no contexto', async () => {
    /* O primeiro degrau do cadastro (RF-002), e o que estava quebrado: sem a
       funcao da 0017 esta chamada lancava, e a api respondia 500. */
    expect(await repo.cnpjTaken(cnpj)).toBe(true)
  })

  it('diz que um CNPJ novo esta livre, em vez de lancar', async () => {
    expect(await repo.cnpjTaken(cnpjDeTeste('4'))).toBe(false)
  })

  it('enxerga empresa de QUALQUER loja — e por isso devolve so um booleano', async () => {
    /*
     * A funcao atravessa a RLS de proposito: o CNPJ e unico no sistema inteiro,
     * nao por empresa. Por isso o retorno e um booleano e nao a empresa — a
     * RF-002 pede recusar "sem revelar dados da empresa existente", e devolver
     * a linha transformaria o formulario de cadastro em consulta de CNPJ.
     */
    const deOutraLoja = randomUUID()
    const cnpjDeOutra = cnpjDeTeste('6')

    await withTenant(
      sql,
      deOutraLoja,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${deOutraLoja}, 'Outra', ${cnpjDeOutra}, ${`o@${cnpjDeOutra}.local`}, '41999990000')
      `,
    )

    expect(await repo.cnpjTaken(cnpjDeOutra)).toBe(true)

    /* E a empresa em si continua invisivel: a funcao e a unica porta, e ela so
       responde sim ou nao. */
    const visiveis = await withTenant(
      sql,
      empresa,
      (tx) => tx<{ total: string }[]>`SELECT count(*)::text AS total FROM companies`,
    )
    expect(Number(visiveis[0]!.total)).toBe(1)

    await withTenant(sql, deOutraLoja, (tx) => tx`DELETE FROM companies`)
  })
})
