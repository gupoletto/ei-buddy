import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'
import { cnpjDeTeste, conectarComoAplicacao, type ConexaoDeAplicacao } from './test-support.js'
import { withTenant } from './tenant.js'

/**
 * Schema de vendas e financeiro — NR-020.
 *
 * O que esta suite guarda nao e "as colunas existem": e o conjunto de
 * invariantes que o banco impoe e que nenhuma camada acima pode esquecer —
 * numeracao sem repeticao sob concorrencia, idempotencia do fechamento, venda
 * que nunca desaparece, e baixa que soma.
 *
 * Como as outras de `db`: pulada sem `DATABASE_URL`, executada na CI, e com as
 * asserções rodando por um papel COMUM — com a conexao de administrador,
 * superusuario ignora RLS e o teste de isolamento no fim mediria o vazio.
 */

const DATABASE_URL = process.env.DATABASE_URL
const MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? DATABASE_URL

describe.skipIf(!DATABASE_URL)('vendas e financeiro — NR-020', () => {
  let admin: Sql
  /** Aplicacao, com papel comum — e nela que o isolamento vale. */
  let sql: Sql
  let aplicacao: ConexaoDeAplicacao
  let empresaA: string
  let empresaB: string
  let produtoA: string

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

  /** Venda minima: um numero, um total. Itens e pagamentos entram por teste. */
  async function criarVenda(
    empresa: string,
    extras: Record<string, unknown> = {},
  ): Promise<{ id: string; number: string }> {
    const id = randomUUID()
    const colunas = {
      id,
      company_id: empresa,
      gross_amount_cents: 1990,
      net_amount_cents: 1990,
      ...extras,
    }
    const [linha] = await withTenant(sql, empresa, async (tx) => {
      const [contador] = await tx<{ next_counter: string }[]>`
        SELECT next_counter('sale')
      `
      const numero = contador!.next_counter
      await tx`INSERT INTO sales ${tx({ ...colunas, number: numero })}`
      return tx<{ id: string; number: string }[]>`
        SELECT id, number FROM sales WHERE id = ${id}
      `
    })
    return linha!
  }

  beforeAll(async () => {
    const r = await migrate(MIGRATION_URL!)
    expect([...r.aplicadas, ...r.jaEstavam]).toContain('0002_dominio_0909')

    admin = postgres(DATABASE_URL!, { max: 6, onnotice: () => {} })
    aplicacao = await conectarComoAplicacao(admin, DATABASE_URL!)
    sql = aplicacao.sql

    /* 14 digitos exatos — ver o comentario em schema.test.ts. */
    empresaA = await criarEmpresa(cnpjDeTeste('3'), 'Loja de Vendas A')
    empresaB = await criarEmpresa(cnpjDeTeste('4'), 'Loja de Vendas B')

    produtoA = randomUUID()
    await withTenant(
      sql,
      empresaA,
      (tx) => tx`
        INSERT INTO products (id, company_id, description, internal_code,
                              unit_of_measure, sale_price_cents, cost_price_cents)
        VALUES (${produtoA}, ${empresaA}, 'Cafe 500g', 'INT-CAFE', 'un', 1990, 1200)
      `,
    )
  }, 60_000)

  afterAll(async () => {
    if (!sql) {
      await admin?.end({ timeout: 5 })
      return
    }
    for (const empresa of [empresaA, empresaB].filter(Boolean)) {
      await withTenant(sql, empresa, async (tx) => {
        await tx`DELETE FROM sale_return_items`
        await tx`DELETE FROM sale_returns`
        await tx`DELETE FROM settlements`
        await tx`DELETE FROM receivables`
        await tx`DELETE FROM payments`
        await tx`DELETE FROM sale_items`
        await tx`DELETE FROM sales`
        await tx`DELETE FROM company_counters`
        await tx`DELETE FROM products`
        await tx`DELETE FROM companies`
      })
    }
    await aplicacao.encerrar()
    await admin.end({ timeout: 5 })
  })

  describe('numeracao', () => {
    it('nao repete nem deixa lacuna sob concorrencia', async () => {
      const antes = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ n: string }[]>`SELECT coalesce(max(number), 0) AS n FROM sales`,
      )
      const base = Number(antes[0]!.n)

      /*
       * `coalesce(max(number),0)+1` daria numero repetido aqui: as dez
       * transacoes leriam o mesmo maximo. O contador com upsert atomico trava
       * a linha da empresa no proprio UPDATE.
       */
      const vendas = await Promise.all(Array.from({ length: 10 }, () => criarVenda(empresaA)))
      const numeros = vendas.map((v) => Number(v.number)).sort((a, b) => a - b)

      expect(new Set(numeros).size).toBe(10)
      expect(numeros).toEqual(Array.from({ length: 10 }, (_, i) => base + i + 1))
    })

    it('cada empresa tem a propria sequencia', async () => {
      const naB = await criarVenda(empresaB)
      /* A primeira venda da loja B e a numero 1, por mais que A ja tenha dez. */
      expect(Number(naB.number)).toBe(1)
    })
  })

  describe('idempotencia do fechamento — RF-036', () => {
    it('a mesma chave nao gera duas vendas', async () => {
      const chave = `pdv-${Date.now()}`
      await criarVenda(empresaA, { idempotency_key: chave })

      await expect(criarVenda(empresaA, { idempotency_key: chave })).rejects.toThrow(
        /sales_idempotencia_unica|duplicate key/i,
      )
    })

    it('duas vendas sem chave nao colidem', async () => {
      /* O indice e parcial de proposito: venda criada pelo backoffice nao tem
         chave de PDV, e NULL nao pode colidir com NULL. */
      const uma = await criarVenda(empresaA)
      const outra = await criarVenda(empresaA)
      expect(uma.id).not.toBe(outra.id)
    })

    it('a mesma chave em duas empresas e permitida', async () => {
      const chave = `pdv-comum-${Date.now()}`
      await criarVenda(empresaA, { idempotency_key: chave })
      const naB = await criarVenda(empresaB, { idempotency_key: chave })
      expect(naB.id).toBeTruthy()
    })
  })

  describe('venda nunca desaparece — RNF-040', () => {
    it('cancelamento exige data e autor registrados', async () => {
      const venda = await criarVenda(empresaA)

      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`UPDATE sales SET status = 'cancelled' WHERE id = ${venda.id}`,
        ),
      ).rejects.toThrow(/sales_cancelamento_completo|violates check/i)
    })

    it('venda cancelada continua na tabela', async () => {
      const venda = await criarVenda(empresaA)
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          UPDATE sales
             SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'cliente desistiu'
           WHERE id = ${venda.id}
        `,
      )

      const [linha] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ status: string }[]>`SELECT status FROM sales WHERE id = ${venda.id}`,
      )
      /* Cancelar e um fato novo, nao a ausencia do fato antigo. */
      expect(linha?.status).toBe('cancelled')
    })

    it('data de cancelamento sem status cancelado tambem e recusada', async () => {
      const venda = await criarVenda(empresaA)
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`UPDATE sales SET cancelled_at = now() WHERE id = ${venda.id}`,
        ),
      ).rejects.toThrow(/sales_cancelamento_completo|violates check/i)
    })
  })

  describe('pagamento', () => {
    it('recusa parcelamento fora do credito', async () => {
      const venda = await criarVenda(empresaA)
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO payments (company_id, sale_id, method, amount_cents, installments)
            VALUES (${empresaA}, ${venda.id}, 'pix', 1990, 3)
          `,
        ),
      ).rejects.toThrow(/payments_parcelamento_so_no_credito|violates check/i)
    })

    it('aceita credito parcelado com bandeira', async () => {
      const venda = await criarVenda(empresaA)
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          INSERT INTO payments (company_id, sale_id, method, amount_cents, installments, brand, card_fee_cents)
          VALUES (${empresaA}, ${venda.id}, 'credit', 30000, 3, 'visa', 1497)
        `,
      )
      const [p] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ installments: number }[]>`
          SELECT installments FROM payments WHERE sale_id = ${venda.id}
        `,
      )
      expect(p?.installments).toBe(3)
    })

    it('recusa pagamento de valor zero', async () => {
      const venda = await criarVenda(empresaA)
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO payments (company_id, sale_id, method, amount_cents)
            VALUES (${empresaA}, ${venda.id}, 'cash', 0)
          `,
        ),
      ).rejects.toThrow(/violates check/i)
    })
  })

  describe('item da venda guarda o passado', () => {
    it('a copia da descricao e do custo nao muda quando o produto muda', async () => {
      const venda = await criarVenda(empresaA)
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          INSERT INTO sale_items (company_id, sale_id, product_id, description,
                                  unit_of_measure, quantity, unit_price_cents,
                                  cost_price_cents, total_cents)
          VALUES (${empresaA}, ${venda.id}, ${produtoA}, 'Cafe 500g', 'un', 1, 1990, 1200, 1990)
        `,
      )

      /* Reajuste depois da venda. */
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          UPDATE products SET description = 'Cafe 500g (novo rotulo)', cost_price_cents = 1500
           WHERE id = ${produtoA}
        `,
      )

      const [item] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ description: string; cost_price_cents: string }[]>`
          SELECT description, cost_price_cents FROM sale_items WHERE sale_id = ${venda.id}
        `,
      )

      /* Se o item apontasse para o produto vivo, a margem historica se
         reescreveria a cada reajuste. */
      expect(item?.description).toBe('Cafe 500g')
      expect(Number(item?.cost_price_cents)).toBe(1200)
    })

    it('recusa devolucao de mais itens do que foram vendidos — RF-044', async () => {
      const venda = await criarVenda(empresaA)
      const itemId = randomUUID()
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          INSERT INTO sale_items (id, company_id, sale_id, description, unit_of_measure,
                                  quantity, unit_price_cents, total_cents)
          VALUES (${itemId}, ${empresaA}, ${venda.id}, 'Cafe', 'un', 2, 1990, 3980)
        `,
      )

      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`UPDATE sale_items SET returned_quantity = 3 WHERE id = ${itemId}`,
        ),
      ).rejects.toThrow(/devolucao_ate_o_vendido|violates check/i)
    })
  })

  describe('recebivel e baixa', () => {
    async function criarRecebivel(empresa: string, extras: Record<string, unknown> = {}) {
      const id = randomUUID()
      await withTenant(
        sql,
        empresa,
        (tx) =>
          tx`INSERT INTO receivables ${tx({
            id,
            company_id: empresa,
            origin: 'manual',
            description: 'Fiado de agosto',
            amount_cents: 10000,
            net_amount_cents: 10000,
            due_date: '2026-10-10',
            ...extras,
          })}`,
      )
      return id
    }

    it('guarda bruto e liquido separados — RF-063', async () => {
      const id = await criarRecebivel(empresaA, { amount_cents: 30000, net_amount_cents: 28503 })
      const [r] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ amount_cents: string; net_amount_cents: string }[]>`
          SELECT amount_cents, net_amount_cents FROM receivables WHERE id = ${id}
        `,
      )
      /* O liquido e o que cai na conta, ja sem a tarifa. Recalcular na leitura
         aplicaria a tabela de hoje sobre a venda de ontem. */
      expect(Number(r?.amount_cents)).toBe(30000)
      expect(Number(r?.net_amount_cents)).toBe(28503)
    })

    it('recusa baixa maior que o valor do recebivel', async () => {
      const id = await criarRecebivel(empresaA)
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`UPDATE receivables SET settled_amount_cents = 20000 WHERE id = ${id}`,
        ),
      ).rejects.toThrow(/baixa_ate_o_valor|violates check/i)
    })

    it('recusa liquidado sem data de liquidacao', async () => {
      const id = await criarRecebivel(empresaA)
      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`UPDATE receivables SET status = 'settled' WHERE id = ${id}`,
        ),
      ).rejects.toThrow(/liquidado_completo|violates check/i)
    })

    it('recusa parcela maior que o total de parcelas', async () => {
      await expect(
        criarRecebivel(empresaA, { installment_number: 4, installment_count: 3 }),
      ).rejects.toThrow(/parcela_valida|violates check/i)
    })

    it('a soma das baixas e o saldo recebido, inclusive com estorno', async () => {
      const id = await criarRecebivel(empresaA)

      const baixaId = randomUUID()
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          INSERT INTO settlements (id, company_id, receivable_id, amount_cents, method)
          VALUES (${baixaId}, ${empresaA}, ${id}, 6000, 'pix')
        `,
      )
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          INSERT INTO settlements (company_id, receivable_id, amount_cents, method, reverses_id)
          VALUES (${empresaA}, ${id}, -6000, 'pix', ${baixaId})
        `,
      )

      const [soma] = await withTenant(
        sql,
        empresaA,
        (tx) => tx<{ total: string }[]>`
          SELECT coalesce(sum(amount_cents), 0) AS total FROM settlements WHERE receivable_id = ${id}
        `,
      )
      /* Estorno e linha nova com valor negativo, nao campo sobrescrito: a
         soma continua sendo o saldo, e o historico continua legivel. */
      expect(Number(soma!.total)).toBe(0)
    })

    it('recusa estorno positivo e baixa negativa', async () => {
      const id = await criarRecebivel(empresaA)
      const baixaId = randomUUID()
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          INSERT INTO settlements (id, company_id, receivable_id, amount_cents, method)
          VALUES (${baixaId}, ${empresaA}, ${id}, 1000, 'cash')
        `,
      )

      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO settlements (company_id, receivable_id, amount_cents, method, reverses_id)
            VALUES (${empresaA}, ${id}, 1000, 'cash', ${baixaId})
          `,
        ),
      ).rejects.toThrow(/estorno_e_negativo|violates check/i)

      await expect(
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO settlements (company_id, receivable_id, amount_cents, method)
            VALUES (${empresaA}, ${id}, -500, 'cash')
          `,
        ),
      ).rejects.toThrow(/estorno_e_negativo|violates check/i)
    })

    it('a mesma baixa nao pode ser estornada duas vezes', async () => {
      const id = await criarRecebivel(empresaA)
      const baixaId = randomUUID()
      await withTenant(
        sql,
        empresaA,
        (tx) => tx`
          INSERT INTO settlements (id, company_id, receivable_id, amount_cents, method)
          VALUES (${baixaId}, ${empresaA}, ${id}, 2000, 'pix')
        `,
      )
      const estornar = () =>
        withTenant(
          sql,
          empresaA,
          (tx) => tx`
            INSERT INTO settlements (company_id, receivable_id, amount_cents, method, reverses_id)
            VALUES (${empresaA}, ${id}, -2000, 'pix', ${baixaId})
          `,
        )

      await estornar()
      /* Estornar duas vezes devolveria dinheiro que entrou uma. */
      await expect(estornar()).rejects.toThrow(/um_estorno_por_baixa|duplicate key/i)
    })
  })

  it('venda de uma loja nao aparece na outra', async () => {
    const venda = await criarVenda(empresaA)
    const naB = await withTenant(
      sql,
      empresaB,
      (tx) => tx<{ id: string }[]>`SELECT id FROM sales WHERE id = ${venda.id}`,
    )
    expect(naB).toEqual([])
  })
})
