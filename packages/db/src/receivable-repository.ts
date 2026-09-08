import type { ReceivableOutput } from '@na-regua/contracts'
import type { ReceivableQueries } from '@na-regua/core'
import type { Sql } from 'postgres'
import { withTenant } from './tenant.js'

/**
 * Leitura dos recebiveis — NR-074, RF-064, RF-066.
 *
 * So leitura. Quem cria recebivel e a venda (`sale-unit-of-work`), e quem o
 * baixa e o `settlement-repository` — os dois escrevem em mais de uma tabela na
 * mesma transacao, e essa responsabilidade ja tem dono. Um caminho de escrita
 * aqui seria um segundo jeito de mexer no mesmo saldo, e os dois divergiriam.
 */

type Linha = {
  id: string
  sale_id: string | null
  customer_id: string | null
  customer_name: string | null
  description: string
  /* `bigint` volta como STRING no postgres.js, para nao perder precisao acima
     de 2^53. As portas declaram `number`, e a conversao acontece na BORDA — um
     valor em string entrando num calculo estoura com "Cannot mix BigInt". */
  amount_cents: string | number
  net_amount_cents: string | number
  settled_amount_cents: string | number
  due_date: string
  installment_number: number
  installment_count: number
  status: string
  created_at: Date
}

const numero = (valor: unknown): number => Number(valor)

const paraSaida = (l: Linha): ReceivableOutput => ({
  id: l.id,
  saleId: l.sale_id,
  customerId: l.customer_id,
  customerName: l.customer_name,
  description: l.description,
  amountCents: numero(l.amount_cents),
  netAmountCents: numero(l.net_amount_cents),
  settledAmountCents: numero(l.settled_amount_cents),
  dueDate: l.due_date,
  installmentNumber: l.installment_number,
  installmentCount: l.installment_count,
  status: l.status as ReceivableOutput['status'],
  createdAt: l.created_at.toISOString(),
})

/**
 * Duas coisas que o SQL abaixo faz de propósito, ditas aqui fora.
 *
 * **`to_char` no vencimento.** O postgres.js converte `date` para meia-noite
 * UTC, e em America/Sao_Paulo isso vira o dia ANTERIOR na formatacao — uma
 * conta que vence dia 10 apareceria vencendo dia 9. Devolver texto corta o
 * problema na origem.
 *
 * **`LEFT JOIN customers`, e nao INNER.** Venda sem identificar o cliente e
 * caminho normal no balcao (RF-009), e um INNER faria esses recebiveis sumirem
 * da lista — dinheiro a receber que a tela nao mostra.
 *
 * (Os comentarios ficam aqui e nao dentro do template: crase dentro de template
 * literal fecha a string, e o esbuild reclama de um erro que nao esta onde
 * parece.)
 */
export function createReceivableRepository(sql: Sql): ReceivableQueries {
  return {
    list: async (companyId, criterio) => {
      const linhas = await withTenant(
        sql,
        companyId,
        (tx) => tx<Linha[]>`
          SELECT r.id,
                 r.sale_id,
                 r.customer_id,
                 c.name AS customer_name,
                 r.description,
                 r.amount_cents,
                 r.net_amount_cents,
                 r.settled_amount_cents,
                 to_char(r.due_date, 'YYYY-MM-DD') AS due_date,
                 r.installment_number,
                 r.installment_count,
                 r.status,
                 r.created_at
          FROM receivables r
          LEFT JOIN customers c ON c.id = r.customer_id
          ${
            criterio.status.length === 0
              ? tx``
              : tx`WHERE r.status = ANY(${criterio.status as string[]})`
          }
          ORDER BY r.due_date
        `,
      )

      return linhas.map(paraSaida)
    },
  }
}
