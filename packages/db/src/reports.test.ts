import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { createReportRepository } from './report-repository.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * Faturamento e rankings — NR-077, US-041.
 *
 * O que se prova aqui e o que so o banco prova: que o mes de uma venda depende
 * do FUSO e nao do acaso, que venda cancelada nao entra, que o corte do ranking
 * acontece no banco, e que nada disso enxerga a loja do lado.
 *
 * A serie completa com zeros e o ticket medio tem teste em `core`, contra
 * falso: sao regra, e regra nao precisa de banco para ser verificada.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

const SP = 'America/Sao_Paulo'

describe.skipIf(!DATABASE_URL)('relatorios de venda — NR-077', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresaA: string
  let empresaB: string

  let repo: ReturnType<typeof createReportRepository>

  let proximoNumero = 1

  async function criarEmpresa(cnpj: string, nome: string): Promise<string> {
    const id = randomUUID()
    await withTenant(
      sql,
      id,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${id}, ${nome}, ${cnpj}, ${`r@${cnpj}.local`}, '41999990000')
      `,
    )
    return id
  }

  async function criarCliente(empresa: string, nome: string): Promise<string> {
    const id = randomUUID()
    await withTenant(
      sql,
      empresa,
      (tx) => tx`
        INSERT INTO customers (id, company_id, name) VALUES (${id}, ${empresa}, ${nome})
      `,
    )
    return id
  }

  async function criarProduto(empresa: string, descricao: string): Promise<string> {
    const id = randomUUID()
    await withTenant(
      sql,
      empresa,
      (tx) => tx`
        INSERT INTO products
          (id, company_id, description, internal_code, unit_of_measure, sale_price_cents)
        VALUES (${id}, ${empresa}, ${descricao}, ${`INT-${id.slice(0, 8)}`}, 'un', 1000)
      `,
    )
    return id
  }

  /** `createdAt` em ISO com fuso: o instante e o dado do teste. */
  async function criarVenda(
    empresa: string,
    opcoes: {
      createdAt: string
      netCents: number
      customerId?: string | null
      status?: string
      itens?: { productId: string | null; quantity: number; totalCents: number }[]
    },
  ): Promise<string> {
    const id = randomUUID()
    const numero = proximoNumero++
    const cancelada = opcoes.status === 'cancelled'

    await withTenant(sql, empresa, async (tx) => {
      await tx`
        INSERT INTO sales
          (id, company_id, number, customer_id, status, gross_amount_cents, discount_cents,
           net_amount_cents, created_at, cancelled_at)
        VALUES (${id}, ${empresa}, ${numero}, ${opcoes.customerId ?? null},
    ${opcoes.status ?? 'open'}, ${opcoes.netCents}, 0, ${opcoes.netCents},
                ${opcoes.createdAt}, ${cancelada ? opcoes.createdAt : null})
      `

      for (const item of opcoes.itens ?? []) {
        await tx`
          INSERT INTO sale_items
            (company_id, sale_id, product_id, description, unit_of_measure, quantity,
             unit_price_cents, total_cents)
          VALUES (${empresa}, ${id}, ${item.productId}, 'Item', 'un', ${item.quantity},
                  ${Math.round(item.totalCents / item.quantity)}, ${item.totalCents})
        `
      }
    })

    return id
  }

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0002_dominio_0909')

    admin = postgres(DATABASE_URL!, { max: 6, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    empresaA = await criarEmpresa(cnpjDeTeste('7'), 'Loja Relatorio A')
    empresaB = await criarEmpresa(cnpjDeTeste('6'), 'Loja Relatorio B')

    repo = createReportRepository(sql, SP)
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    for (const empresa of [empresaA, empresaB].filter(Boolean)) {
      await withTenant(sql, empresa, async (tx) => {
        await tx`DELETE FROM sale_items`
        await tx`DELETE FROM sales`
        await tx`DELETE FROM products`
        await tx`DELETE FROM customers`
        await tx`DELETE FROM companies`
      })
    }
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  describe('faturamento mes a mes', () => {
    it('poe a venda no mes do FUSO DE EXIBICAO, e nao no de UTC', async () => {
      /*
       * 31/01 as 21h30 em Sao Paulo e 01/02 as 00h30 em UTC. Para o lojista a
       * venda e de janeiro — foi ele quem fechou o caixa naquela noite. Agrupar
       * por UTC a mandaria para fevereiro e o mes fecharia com uma venda a
       * menos, sem nenhum sinal de que faltou.
       */
      await criarVenda(empresaA, { createdAt: '2026-02-01T00:30:00.000Z', netCents: 10_000 })

      const emSaoPaulo = await repo.revenueByMonth(empresaA, '2026-01-01', '2026-02-28')
      expect(emSaoPaulo.map((m) => m.month)).toEqual(['2026-01'])

      /* O MESMO dado com outro fuso cai em outro mes: prova que o parametro
         manda de verdade, e nao que o teste passou por sorte do relogio. */
      const emUtc = await createReportRepository(sql, 'UTC').revenueByMonth(
        empresaA,
        '2026-01-01',
        '2026-02-28',
      )
      expect(emUtc.map((m) => m.month)).toEqual(['2026-02'])
    })

    it('nao conta venda cancelada', async () => {
      await criarVenda(empresaA, { createdAt: '2026-03-10T15:00:00.000Z', netCents: 50_000 })
      await criarVenda(empresaA, {
        createdAt: '2026-03-11T15:00:00.000Z',
        netCents: 90_000,
        status: 'cancelled',
      })

      const [marco] = await repo.revenueByMonth(empresaA, '2026-03-01', '2026-03-31')

      expect(marco?.netCents).toBe(50_000)
      expect(marco?.salesCount).toBe(1)
    })

    it('inclui os dois extremos do periodo, no fuso de exibicao', async () => {
      /* 01/04 00h05 e 30/04 23h55 em Sao Paulo — as duas pontas do mes. A
         segunda e 01/05 em UTC, e um filtro por dia UTC a deixaria de fora. */
      await criarVenda(empresaA, { createdAt: '2026-04-01T03:05:00.000Z', netCents: 1_100 })
      await criarVenda(empresaA, { createdAt: '2026-05-01T02:55:00.000Z', netCents: 2_200 })

      const [abril] = await repo.revenueByMonth(empresaA, '2026-04-01', '2026-04-30')

      expect(abril?.netCents).toBe(3_300)
      expect(abril?.salesCount).toBe(2)
    })

    it('devolve apenas os meses com venda — quem completa e core', async () => {
      const meses = await repo.revenueByMonth(empresaA, '2026-01-01', '2026-04-30')

      expect(meses.map((m) => m.month)).toEqual(['2026-01', '2026-03', '2026-04'])
    })

    it('nao enxerga a venda da outra loja', async () => {
      await criarVenda(empresaB, { createdAt: '2026-03-12T15:00:00.000Z', netCents: 777_000 })

      const [marcoA] = await repo.revenueByMonth(empresaA, '2026-03-01', '2026-03-31')
      const [marcoB] = await repo.revenueByMonth(empresaB, '2026-03-01', '2026-03-31')

      expect(marcoA?.netCents).toBe(50_000)
      expect(marcoB?.netCents).toBe(777_000)
    })
  })

  describe('ranking de clientes', () => {
    let maria: string
    let joao: string

    beforeAll(async () => {
      maria = await criarCliente(empresaA, 'Maria')
      joao = await criarCliente(empresaA, 'Joao')

      await criarVenda(empresaA, {
        createdAt: '2026-06-05T15:00:00.000Z',
        netCents: 30_000,
        customerId: maria,
      })
      await criarVenda(empresaA, {
        createdAt: '2026-06-20T15:00:00.000Z',
        netCents: 20_000,
        customerId: maria,
      })
      await criarVenda(empresaA, {
        createdAt: '2026-06-10T15:00:00.000Z',
        netCents: 40_000,
        customerId: joao,
      })
      /* Balcao sem identificacao — RF-033. */
      await criarVenda(empresaA, { createdAt: '2026-06-11T15:00:00.000Z', netCents: 5_000 })
      /* Cancelada de cliente: nao entra nem no ranking nem na sobra. */
      await criarVenda(empresaA, {
        createdAt: '2026-06-12T15:00:00.000Z',
        netCents: 999_000,
        customerId: joao,
        status: 'cancelled',
      })
    })

    it('ordena pelo que cada um gastou, com nome e ultima compra', async () => {
      const r = await repo.topCustomers(empresaA, '2026-06-01', '2026-06-30', 10)

      expect(r.posicoes.map((p) => p.customerName)).toEqual(['Maria', 'Joao'])
      expect(r.posicoes[0]).toMatchObject({
        customerId: maria,
        netCents: 50_000,
        salesCount: 2,
        lastSaleOn: '2026-06-20',
      })
    })

    it('separa a venda de balcao do ranking, sem perde-la', async () => {
      const r = await repo.topCustomers(empresaA, '2026-06-01', '2026-06-30', 10)

      expect(r.posicoes.every((p) => p.customerId !== null)).toBe(true)
      expect(r.sobraCents).toBe(5_000)
    })

    it('corta no limite pedido — o corte e do banco', async () => {
      const r = await repo.topCustomers(empresaA, '2026-06-01', '2026-06-30', 1)

      expect(r.posicoes.map((p) => p.customerName)).toEqual(['Maria'])
      /* A sobra NAO muda com o limite: ela e a venda sem cliente, e nao "o que
         ficou de fora da lista". Se mudasse, dois limites dariam dois
         faturamentos diferentes para o mesmo mes. */
      expect(r.sobraCents).toBe(5_000)
    })

    it('periodo sem venda devolve lista vazia e sobra zero, nao erro', async () => {
      const r = await repo.topCustomers(empresaA, '2030-01-01', '2030-01-31', 10)

      expect(r.posicoes).toEqual([])
      expect(r.sobraCents).toBe(0)
    })
  })

  describe('ranking de produtos', () => {
    let cafe: string
    let acucar: string

    beforeAll(async () => {
      cafe = await criarProduto(empresaA, 'Cafe torrado 500g')
      acucar = await criarProduto(empresaA, 'Acucar 1kg')

      await criarVenda(empresaA, {
        createdAt: '2026-07-05T15:00:00.000Z',
        netCents: 12_000,
        itens: [
          { productId: cafe, quantity: 8, totalCents: 8_000 },
          { productId: acucar, quantity: 2, totalCents: 2_000 },
          /* Venda avulsa: item sem produto no cadastro. */
          { productId: null, quantity: 1, totalCents: 2_000 },
        ],
      })
      await criarVenda(empresaA, {
        createdAt: '2026-07-06T15:00:00.000Z',
        netCents: 3_000,
        itens: [{ productId: acucar, quantity: 3, totalCents: 3_000 }],
      })
      /* Cancelada: os itens dela nao contam. */
      await criarVenda(empresaA, {
        createdAt: '2026-07-07T15:00:00.000Z',
        netCents: 90_000,
        status: 'cancelled',
        itens: [{ productId: acucar, quantity: 90, totalCents: 90_000 }],
      })
    })

    it('ordena por quantidade e usa a descricao do CADASTRO', async () => {
      const r = await repo.topProducts(empresaA, '2026-07-01', '2026-07-31', 10)

      expect(r.posicoes).toEqual([
        { productId: cafe, productName: 'Cafe torrado 500g', quantity: 8, netCents: 8_000 },
        { productId: acucar, productName: 'Acucar 1kg', quantity: 5, netCents: 5_000 },
      ])
    })

    it('separa o item sem produto, sem perde-lo', async () => {
      const r = await repo.topProducts(empresaA, '2026-07-01', '2026-07-31', 10)

      expect(r.sobraCents).toBe(2_000)
    })

    it('corta no limite pedido', async () => {
      const r = await repo.topProducts(empresaA, '2026-07-01', '2026-07-31', 1)

      expect(r.posicoes.map((p) => p.productId)).toEqual([cafe])
    })

    it('nao enxerga o produto da outra loja', async () => {
      const outro = await criarProduto(empresaB, 'Farinha')
      await criarVenda(empresaB, {
        createdAt: '2026-07-08T15:00:00.000Z',
        netCents: 4_000,
        itens: [{ productId: outro, quantity: 40, totalCents: 4_000 }],
      })

      const r = await repo.topProducts(empresaA, '2026-07-01', '2026-07-31', 10)

      expect(r.posicoes.map((p) => p.productId)).not.toContain(outro)
    })
  })
})
