import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { createProductRepository } from './registration-repositories.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * O catalogo do backoffice — NR-072, US-008.
 *
 * A paginacao e os filtros tem teste em `core`, contra falso. O que se prova
 * AQUI e o que so o banco prova: que `count(*) OVER ()` conta antes do `LIMIT`
 * e nao depois, que o `FILTER` das contagens do resumo casa com o que a lista
 * mostra, que produto apagado nao entra em nenhum dos dois, e que nada disso
 * enxerga a loja do lado.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('catalogo do backoffice — NR-072', () => {
  let admin: Sql
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresaA: string
  let empresaB: string

  let repo: ReturnType<typeof createProductRepository>

  let sequencia = 0

  async function criarEmpresa(cnpj: string, nome: string): Promise<string> {
    const id = randomUUID()
    await withTenant(
      sql,
      id,
      (tx) => tx`
        INSERT INTO companies (id, legal_name, cnpj, email, phone)
        VALUES (${id}, ${nome}, ${cnpj}, ${`k@${cnpj}.local`}, '41999990000')
      `,
    )
    return id
  }

  /**
   * Grava direto na tabela, e nao pelo repositorio.
   *
   * `create` nao aceita saldo — o estoque so muda por movimento (NR-023), e
   * montar a trilha inteira para testar um filtro seria testar outra coisa.
   */
  async function criarProduto(
    empresa: string,
    dados: {
      description: string
      stock: number
      minStock?: number
      costPriceCents?: number
      apagado?: boolean
    },
  ): Promise<string> {
    const id = randomUUID()
    sequencia += 1

    await withTenant(
      sql,
      empresa,
      (tx) => tx`
        INSERT INTO products
          (id, company_id, description, internal_code, unit_of_measure,
           sale_price_cents, cost_price_cents, stock_quantity, min_stock, deleted_at)
        VALUES (${id}, ${empresa}, ${dados.description}, ${`P-${sequencia}-${id.slice(0, 6)}`},
                'un', 1000, ${dados.costPriceCents ?? 400}, ${dados.stock},
                ${dados.minStock ?? 5}, ${dados.apagado === true ? new Date() : null})
      `,
    )

    return id
  }

  const pedido = { stock: 'todos' as const, offset: 0, limite: 24 }

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0002_cadastros')

    admin = postgres(DATABASE_URL!, { max: 6, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    empresaA = await criarEmpresa(cnpjDeTeste('5'), 'Loja Catalogo A')
    empresaB = await criarEmpresa(cnpjDeTeste('4'), 'Loja Catalogo B')

    repo = createProductRepository(sql)

    /* Cafe esgotado, Acucar abaixo do minimo, os outros normais. Mais um
       apagado, que nao pode aparecer em lugar nenhum. */
    await criarProduto(empresaA, { description: 'Acucar', stock: 2 })
    await criarProduto(empresaA, { description: 'Biscoito', stock: 10 })
    await criarProduto(empresaA, { description: 'Cafe', stock: 0 })
    await criarProduto(empresaA, { description: 'Detergente', stock: 10 })
    await criarProduto(empresaA, { description: 'Erva-mate', stock: 10, costPriceCents: 700 })
    await criarProduto(empresaA, { description: 'Zimbro apagado', stock: 99, apagado: true })

    await criarProduto(empresaB, { description: 'Farinha da outra loja', stock: 7 })
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    for (const empresa of [empresaA, empresaB].filter(Boolean)) {
      await withTenant(sql, empresa, async (tx) => {
        await tx`DELETE FROM products`
        await tx`DELETE FROM companies`
      })
    }
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  describe('a pagina e o total', () => {
    it('conta ANTES do LIMIT, e nao depois', async () => {
      const r = await repo.listCatalog(empresaA, { ...pedido, limite: 2 })

      expect(r.produtos.map((p) => p.description)).toEqual(['Acucar', 'Biscoito'])
      /*
       * CINCO, e nao dois. `count(*) OVER ()` conta as linhas que casaram com
       * o WHERE antes do corte — e e o que faz a tela dizer "2 de 5". Um
       * `count` aplicado depois do LIMIT devolveria 2 e a pagina seguinte nunca
       * seria oferecida.
       */
      expect(r.total).toBe(5)
    })

    it('a segunda pagina continua de onde a primeira parou', async () => {
      const r = await repo.listCatalog(empresaA, { ...pedido, offset: 2, limite: 2 })

      expect(r.produtos.map((p) => p.description)).toEqual(['Cafe', 'Detergente'])
      expect(r.total).toBe(5)
    })

    it('pagina alem do fim vem vazia, com total zero', async () => {
      const r = await repo.listCatalog(empresaA, { ...pedido, offset: 500, limite: 2 })

      /*
       * O total cai para zero porque ele viaja NA LINHA, e nao ha linha. Quem
       * chama ja tem o total da primeira pagina; pedir pagina 500 de um
       * catalogo de 5 e um pedido sem sentido, e devolver vazio e a resposta.
       */
      expect(r.produtos).toEqual([])
      expect(r.total).toBe(0)
    })

    it('busca por termo estreita o total, e nao so a pagina', async () => {
      const r = await repo.listCatalog(empresaA, { ...pedido, termo: 'caf' })

      expect(r.produtos.map((p) => p.description)).toEqual(['Cafe'])
      expect(r.total).toBe(1)
    })

    it('produto apagado nao aparece na lista', async () => {
      const r = await repo.listCatalog(empresaA, { ...pedido, termo: 'Zimbro' })

      expect(r.produtos).toEqual([])
    })

    it('nao enxerga o catalogo da outra loja', async () => {
      const a = await repo.listCatalog(empresaA, pedido)
      const b = await repo.listCatalog(empresaB, pedido)

      expect(a.total).toBe(5)
      expect(b.total).toBe(1)
      expect(a.produtos.map((p) => p.description)).not.toContain('Farinha da outra loja')
    })
  })

  describe('os filtros de estoque', () => {
    it('esgotado e quem esta em zero', async () => {
      const r = await repo.listCatalog(empresaA, { ...pedido, stock: 'esgotado' })

      expect(r.produtos.map((p) => p.description)).toEqual(['Cafe'])
      expect(r.total).toBe(1)
    })

    it('estoque baixo NAO inclui o zerado', async () => {
      const r = await repo.listCatalog(empresaA, { ...pedido, stock: 'baixo' })

      /* Quem abre "estoque baixo" quer o que ainda da para vender e esta
         acabando. O zerado ja tem a propria aba. */
      expect(r.produtos.map((p) => p.description)).toEqual(['Acucar'])
    })
  })

  describe('o resumo', () => {
    it('conta o zerado nas duas contagens, porque ele esta nas duas', async () => {
      const r = await repo.catalogSummary(empresaA)

      expect(r.total).toBe(5)
      /* Cafe (0) e Acucar (2) estao abaixo do minimo de 5; so o Cafe esta
         esgotado. As duas contagens se SOBREPOEM e nao somam. */
      expect(r.belowMinimum).toBe(2)
      expect(r.outOfStock).toBe(1)
    })

    it('valor em estoque e a preco de custo, e ignora o apagado', async () => {
      const r = await repo.catalogSummary(empresaA)

      /* 2x400 + 10x400 + 0 + 10x400 + 10x700 = 800 + 4000 + 4000 + 7000. O
         apagado tem 99 unidades e ficaria muito visivel se entrasse. */
      expect(r.stockValueCents).toBe(15_800)
    })

    it('o resumo da outra loja e o dela', async () => {
      const r = await repo.catalogSummary(empresaB)

      expect(r.total).toBe(1)
      expect(r.stockValueCents).toBe(2_800)
    })
  })
})
