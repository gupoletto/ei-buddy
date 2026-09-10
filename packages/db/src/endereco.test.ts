import { randomUUID } from 'node:crypto'
import type { NewCustomer } from '@na-regua/core'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { createCustomerRepository } from './registration-repositories.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * O endereco de cliente sob RLS — NR-072, RF-009, RF-011.
 *
 * A migration 0019 criou as sete colunas. Este arquivo confere as duas coisas
 * que so o banco decide: que o endereco GRAVADO e o mesmo que volta, e que a
 * ficha de um cliente nao atravessa a fronteira da loja.
 *
 * Conexao de papel COMUM (`conectarComoAplicacao`), e nao a do dono do banco:
 * dono e superusuario, a RLS nunca chega a ser avaliada, e um teste de
 * isolamento ali ficaria verde medindo o vazio.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

type Endereco = NonNullable<NewCustomer['address']>

const ENDERECO = {
  zipCode: '80010000',
  street: 'Rua XV de Novembro',
  number: 'KM 42',
  complement: 'Sala 3',
  district: 'Centro',
  city: 'Curitiba',
  state: 'PR',
} satisfies Endereco

describe.skipIf(!DATABASE_URL)('endereco de cliente — NR-072', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresa: string
  let outraEmpresa: string
  let usuario: string

  let repo: ReturnType<typeof createCustomerRepository>

  const criarEmpresa = async (id: string, semente: string) => {
    const cnpj = cnpjDeTeste(semente)
    await withTenant(
      sql,
      id,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${id}, 'Loja do Endereco', ${cnpj}, ${`e@${cnpj}.local`}, '41999990000')
      `,
    )
  }

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0002_dominio_0909')

    admin = postgres(DATABASE_URL!, { max: 4, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    repo = createCustomerRepository(sql)

    empresa = randomUUID()
    outraEmpresa = randomUUID()
    await criarEmpresa(empresa, '3')
    await criarEmpresa(outraEmpresa, '5')

    /* `created_by` tem FK para `users`: sem um usuario de verdade todo INSERT
       falha na chave estrangeira, e o teste da UF passaria pelo motivo errado
       — rejeitado antes de o CHECK ser avaliado. `users` e tabela de
       plataforma, entao entra pela conexao do dono. */
    usuario = randomUUID()
    await admin`
      INSERT INTO users (id, name, email) VALUES (${usuario}, 'Dona', ${`n${usuario}@local`})
    `
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    for (const id of [empresa, outraEmpresa]) {
      await withTenant(sql, id, (tx) => tx`DELETE FROM customers`)
      await withTenant(sql, id, (tx) => tx`DELETE FROM companies`)
    }
    await admin`DELETE FROM users WHERE id = ${usuario}`
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  const novoCliente = (companyId: string, address?: NewCustomer['address']): NewCustomer => ({
    companyId,
    name: 'Dona Marta',
    phone: '41988887777',
    createdBy: usuario,
    createdAt: new Date('2026-09-07T12:00:00.000Z'),
    ...(address === undefined ? {} : { address }),
  })

  it('grava os sete campos e devolve os mesmos na leitura', async () => {
    /* O ida-e-volta inteiro. Antes da 0019 o cadastro aceitava os campos na
       tela e nao tinha onde guardar: o lojista digitava e sumia. */
    const criado = await repo.create(novoCliente(empresa, ENDERECO))

    const lido = await repo.findById(empresa, criado.id)

    expect(lido?.address).toEqual(ENDERECO)
  })

  it('cliente sem endereco volta com os sete campos NULOS, e nao ausentes', async () => {
    /* A tela distingue "nao informou" de "o campo nao existe": um `undefined`
       aqui faria a ficha desenhar buracos em vez de "Nao informado". */
    const criado = await repo.create(novoCliente(empresa))

    const lido = await repo.findById(empresa, criado.id)

    expect(lido?.address).toEqual({
      zipCode: null,
      street: null,
      number: null,
      complement: null,
      district: null,
      city: null,
      state: null,
    })
  })

  it('o numero aceita "s/n" e "KM 42" — por isso e texto', async () => {
    const criado = await repo.create(novoCliente(empresa, { ...ENDERECO, number: 's/n' }))

    expect((await repo.findById(empresa, criado.id))?.address.number).toBe('s/n')
  })

  it('a UF fora das 27 e recusada pelo banco, e nao gravada torta', async () => {
    /*
     * A guarda e do CHECK (`uf_valida`), e nao do formulario. O tipo ja recusa
     * "XX" aqui — por isso o `as`, que e o ponto do teste: ele simula quem
     * chega por fora do contrato (importacao de planilha, WhatsApp), e o banco
     * e o unico lugar por onde todos passam.
     */
    const forcado = { ...ENDERECO, state: 'XX' } as unknown as Endereco

    /* Casa a mensagem do CHECK, e nao um erro qualquer: a primeira versao
       deste teste passava porque o INSERT batia na chave estrangeira de
       `created_by` antes de o CHECK ser avaliado. */
    await expect(repo.create(novoCliente(empresa, forcado))).rejects.toThrow(
      /violates check constraint/i,
    )
  })

  it('a ficha de outra loja e invisivel — e por isso vira 404', async () => {
    const daOutra = await repo.create(novoCliente(outraEmpresa, ENDERECO))

    /* A linha EXISTE: o `undefined` vem do isolamento, nao de um banco vazio.
       Sem esta chamada de controle, o teste passaria com a tabela em branco. */
    expect(await repo.findById(outraEmpresa, daOutra.id)).toBeDefined()

    expect(await repo.findById(empresa, daOutra.id)).toBeUndefined()
  })
})
