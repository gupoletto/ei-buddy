import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createInvoiceStore } from './invoice-repository.js'
import { migrate } from './migrate.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * A guarda de notas fiscais — NR-042.
 *
 * O adapter Focus NFe tem teste proprio em `packages/fiscal`, contra um
 * provedor simulado. O que se prova AQUI e o que so o banco prova: que uma
 * venda tem UMA nota, que a corrida entre dois workers nao troca a chave de
 * acesso de um documento ja autorizado, e que o XML sobrevive ao provedor.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

/*
 * Uma chave por caso, e nunca repetida.
 *
 * Chave de acesso e unica por construcao — a SEFAZ nunca emite duas iguais — e
 * o indice `invoices_por_chave` cobra isso. Reusar a mesma em duas vendas fez
 * o teste da corrida estourar com violacao de unicidade: dado irreal, apanhado
 * pela constraint certa.
 */
const chaveDe = (n: number): string => String(n).padStart(44, '0')

describe.skipIf(!DATABASE_URL)('guarda de notas fiscais — NR-042', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresaA: string
  let empresaB: string

  let store: ReturnType<typeof createInvoiceStore>

  async function criarEmpresa(cnpj: string, nome: string): Promise<string> {
    const id = randomUUID()
    await withTenant(
      sql,
      id,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${id}, ${nome}, ${cnpj}, ${`c@${cnpj}.local`}, '41999990000')
      `,
    )
    return id
  }

  /** Uma venda minima, so para a nota ter em que se apoiar. */
  async function criarVenda(empresa: string): Promise<string> {
    const id = randomUUID()
    await withTenant(sql, empresa, async (tx) => {
      const [contador] = await tx<{ next_counter: string }[]>`SELECT next_counter('sale')`
      await tx`
        INSERT INTO sales (id, company_id, number, gross_amount_cents, net_amount_cents)
        VALUES (${id}, ${empresa}, ${contador!.next_counter}, 1990, 1990)
      `
    })
    return id
  }

  const autorizada = (chave: string, numero = 1) => ({
    status: 'authorized' as const,
    accessKey: chave,
    number: numero,
    series: 1,
    danfeUrl: 'https://homologacao.focusnfe.com.br/danfe/1.html',
    xml: '<nfeProc>...</nfeProc>',
    issuedAt: '2026-09-02T13:00:00.000Z',
  })

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0002_dominio_0909')

    admin = postgres(DATABASE_URL!, { max: 4, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    empresaA = await criarEmpresa(cnpjDeTeste('2'), 'Loja Fiscal A')
    empresaB = await criarEmpresa(cnpjDeTeste('3'), 'Loja Fiscal B')

    store = createInvoiceStore(sql)
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    for (const empresa of [empresaA, empresaB].filter(Boolean)) {
      await withTenant(sql, empresa, async (tx) => {
        await tx`DELETE FROM invoices WHERE company_id = ${empresa}`
        await tx`DELETE FROM sales WHERE company_id = ${empresa}`
        await tx`DELETE FROM company_counters WHERE company_id = ${empresa}`
        await tx`DELETE FROM companies WHERE id = ${empresa}`
      })
    }
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  it('guarda a nota e a devolve pela venda', async () => {
    const venda = await criarVenda(empresaA)

    const chave = chaveDe(1)

    await store.save({ companyId: empresaA, saleId: venda, resultado: autorizada(chave) })
    const achada = await store.findBySale(empresaA, venda)

    expect(achada?.resultado).toMatchObject({ status: 'authorized', accessKey: chave })
  })

  it('devolve a mesma nota pela CHAVE — a traducao que o cancelamento precisa', async () => {
    const venda = await criarVenda(empresaA)
    const chave = chaveDe(2)

    await store.save({ companyId: empresaA, saleId: venda, resultado: autorizada(chave, 2) })
    const achada = await store.findByAccessKey(empresaA, chave)

    /* O Focus cancela por REFERENCIA e a porta cancela por chave. Sem este
       caminho, cancelar seria impossivel. */
    expect(achada?.saleId).toBe(venda)
  })

  it('a corrida entre dois workers nao troca a chave de uma nota autorizada', async () => {
    const venda = await criarVenda(empresaA)

    const primeira = await store.save({
      companyId: empresaA,
      saleId: venda,
      resultado: autorizada(chaveDe(3), 10),
    })
    const segunda = await store.save({
      companyId: empresaA,
      saleId: venda,
      resultado: autorizada(chaveDe(4), 11),
    })

    /*
     * `ON CONFLICT DO NOTHING` mais releitura, e nao `DO UPDATE`.
     *
     * Sobrescrever trocaria a chave de acesso de um documento que a SEFAZ ja
     * autorizou, e o lojista ficaria com um XML apontando para uma nota que nao
     * e a dele. As duas gravacoes devolvem o VENCEDOR, e as duas emissoes dao
     * uma nota so.
     */
    if (primeira.resultado.status === 'rejected') throw new Error('esperava autorizada')
    if (segunda.resultado.status === 'rejected') throw new Error('esperava autorizada')

    expect(segunda.resultado.accessKey).toBe(primeira.resultado.accessKey)
    expect(segunda.resultado.accessKey).toBe(chaveDe(3))
  })

  it('guarda a rejeicao, para a tela explicar sem consultar o provedor', async () => {
    const venda = await criarVenda(empresaA)

    await store.save({
      companyId: empresaA,
      saleId: venda,
      resultado: {
        status: 'rejected',
        rejection: { code: '539', message: 'Duplicidade de NF-e com diferenca na chave.' },
      },
    })

    const achada = await store.findBySale(empresaA, venda)

    /* Sem isto, a venda rejeitada seria retransmitida a cada reprocessamento do
       job, e a mensagem que a tela mostra (RF-047) so existiria na memoria de
       quem chamou. */
    expect(achada?.resultado).toMatchObject({
      status: 'rejected',
      rejection: { code: '539' },
    })
  })

  it('contingencia guarda o motivo e nao vira autorizada', async () => {
    const venda = await criarVenda(empresaA)

    await store.save({
      companyId: empresaA,
      saleId: venda,
      resultado: {
        status: 'contingency',
        accessKey: chaveDe(5),
        number: 20,
        series: 1,
        xml: '<nfeProc>contingencia</nfeProc>',
        issuedAt: '2026-09-02T13:00:00.000Z',
        reason: 'SEFAZ indisponivel',
      },
    })

    const achada = await store.findBySale(empresaA, venda)

    /* RF-054: o estado fiscal e explicito. Contingencia tem chave e ainda nao
       tem protocolo — alguem precisa retransmitir depois (RF-053). */
    expect(achada?.resultado.status).toBe('contingency')
  })

  it('cancelar tira a nota das duas buscas', async () => {
    const venda = await criarVenda(empresaA)
    const chave = chaveDe(6)

    await store.save({ companyId: empresaA, saleId: venda, resultado: autorizada(chave, 30) })
    await store.markCancelled(empresaA, chave, {
      protocol: 'PROT-1',
      xml: '<procEventoNFe>...</procEventoNFe>',
      cancelledAt: '2026-09-02T13:30:00.000Z',
    })

    /* Cancelada nao volta como emissao: uma segunda tentativa de cancelar
       precisa responder "nao encontrada" em vez de cancelar de novo. */
    expect(await store.findByAccessKey(empresaA, chave)).toBeUndefined()
    expect(await store.findBySale(empresaA, venda)).toBeUndefined()
  })

  it('o XML do cancelamento fica guardado, mesmo a nota saindo das buscas', async () => {
    const venda = await criarVenda(empresaA)
    const chave = chaveDe(7)

    await store.save({ companyId: empresaA, saleId: venda, resultado: autorizada(chave, 40) })
    await store.markCancelled(empresaA, chave, {
      protocol: 'PROT-2',
      xml: '<procEventoNFe>cancelamento</procEventoNFe>',
      cancelledAt: '2026-09-02T13:30:00.000Z',
    })

    const [linha] = await withTenant(
      sql,
      empresaA,
      (tx) => tx<{ cancellation_protocol: string; cancellation_xml: string }[]>`
        SELECT cancellation_protocol, cancellation_xml
        FROM invoices WHERE company_id = ${empresaA} AND access_key = ${chave}
      `,
    )

    /* O protocolo e a prova perante a SEFAZ, e o XML do evento e um documento
       por si. Sumir das buscas nao pode significar sumir do banco. */
    expect(linha?.cancellation_protocol).toBe('PROT-2')
    expect(linha?.cancellation_xml).toContain('cancelamento')
  })

  it('nota de outra empresa responde como inexistente', async () => {
    const venda = await criarVenda(empresaB)
    const chave = chaveDe(8)

    await store.save({ companyId: empresaB, saleId: venda, resultado: autorizada(chave, 50) })

    /* Inexistente e nao proibida: 403 confirmaria que a chave existe, e chave
       de acesso e dado fiscal de terceiro. */
    expect(await store.findByAccessKey(empresaA, chave)).toBeUndefined()
  })
})
