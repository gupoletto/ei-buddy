import type { FixedCostOutput, PayableOutput } from '@na-regua/contracts'
import type {
  FixedCostChanges,
  FixedCostPayableDraft,
  FixedCostPayableGenerator,
  FixedCostRepository,
  NewFixedCost,
} from '@na-regua/core'
import type { Sql, TransactionSql } from 'postgres'
import { withTenant } from './tenant.js'

/**
 * Custos fixos — NR-110.
 *
 * `bigint` volta como STRING no postgres.js, e a conversao acontece na BORDA
 * — mesmo padrao de `payable-repository.ts`.
 */
const numero = (valor: unknown): number => Number(valor)

type Linha = {
  id: string
  name: string
  amount_cents: string | number
  due_day: number
  account_id: string | null
  account_name: string | null
  created_at: Date
}

const paraSaida = (l: Linha): FixedCostOutput => ({
  id: l.id,
  name: l.name,
  amountCents: numero(l.amount_cents),
  dueDay: l.due_day,
  accountId: l.account_id,
  accountName: l.account_name,
  createdAt: l.created_at.toISOString(),
})

const colunas = (tx: TransactionSql) => tx`
  fc.id, fc.name, fc.amount_cents, fc.due_day,
  fc.account_id, la.name AS account_name, fc.created_at
`

const juncao = (tx: TransactionSql) => tx`
  FROM fixed_costs fc
  LEFT JOIN ledger_accounts la ON la.id = fc.account_id
`

export function createFixedCostRepository(sql: Sql): FixedCostRepository {
  return {
    list: async (companyId) => {
      const linhas = await withTenant(
        sql,
        companyId,
        (tx) => tx<Linha[]>`SELECT ${colunas(tx)} ${juncao(tx)} ORDER BY fc.created_at`,
      )
      return linhas.map(paraSaida)
    },

    findById: async (companyId, id) => {
      const [linha] = await withTenant(
        sql,
        companyId,
        (tx) => tx<Linha[]>`SELECT ${colunas(tx)} ${juncao(tx)} WHERE fc.id = ${id}`,
      )
      return linha === undefined ? undefined : paraSaida(linha)
    },

    insert: async (novo: NewFixedCost) => {
      const [criado] = await withTenant(
        sql,
        novo.companyId,
        (tx) => tx<{ id: string }[]>`
          INSERT INTO fixed_costs
            (company_id, name, amount_cents, due_day, account_id, created_by, created_at)
          VALUES (${novo.companyId}, ${novo.name}, ${novo.amountCents}, ${novo.dueDay},
                  ${novo.accountId}, ${novo.createdBy}, ${novo.createdAt})
          RETURNING id
        `,
      )
      const [linha] = await withTenant(
        sql,
        novo.companyId,
        (tx) => tx<Linha[]>`SELECT ${colunas(tx)} ${juncao(tx)} WHERE fc.id = ${criado!.id}`,
      )
      return paraSaida(linha!)
    },

    update: async (companyId, id, mudancas: FixedCostChanges) => {
      await withTenant(
        sql,
        companyId,
        (tx) => tx`
          UPDATE fixed_costs
          SET name = ${mudancas.name}, amount_cents = ${mudancas.amountCents},
              due_day = ${mudancas.dueDay}, account_id = ${mudancas.accountId},
              updated_at = now()
          WHERE id = ${id}
        `,
      )
      const [linha] = await withTenant(
        sql,
        companyId,
        (tx) => tx<Linha[]>`SELECT ${colunas(tx)} ${juncao(tx)} WHERE fc.id = ${id}`,
      )
      if (linha === undefined) {
        throw new Error(`custo fixo ${id} nao encontrado para a empresa ${companyId}`)
      }
      return paraSaida(linha)
    },

    remove: async (companyId, id) => {
      await withTenant(sql, companyId, (tx) => tx`DELETE FROM fixed_costs WHERE id = ${id}`)
    },
  }
}

type LinhaPayable = {
  id: string
  supplier: string
  description: string
  amount_cents: string | number
  settled_amount_cents: string | number
  /* Texto, de `to_char` — nao `RETURNING *`. O postgres.js devolveria `date`
     como meia-noite UTC, que em America/Sao_Paulo recua um dia ao formatar —
     o mesmo defeito que `payable-repository.ts` evita do mesmo jeito. */
  due_date: string
  status: string
  attachment_key: string | null
  account_id: string | null
  recurrence_id: string | null
  occurrence_number: number | null
  occurrence_count: number | null
  created_at: Date
}

const paraPayable = (l: LinhaPayable): PayableOutput => ({
  id: l.id,
  supplier: l.supplier,
  description: l.description,
  amountCents: numero(l.amount_cents),
  settledAmountCents: numero(l.settled_amount_cents),
  dueDate: l.due_date,
  status: l.status as PayableOutput['status'],
  attachmentKey: l.attachment_key,
  accountId: l.account_id,
  recurrenceId: l.recurrence_id,
  occurrenceNumber: l.occurrence_number,
  occurrenceCount: l.occurrence_count,
  createdAt: l.created_at.toISOString(),
})

/**
 * Gera as contas a pagar do mes — NR-110.
 *
 * `ON CONFLICT ... DO NOTHING` no indice unico parcial
 * (`payables_um_por_custo_fixo_por_vencimento`) e a idempotencia de verdade:
 * rodar duas vezes no mesmo mes nao duplica, e a garantia e ATOMICA — nao
 * depende de uma consulta "ja existe?" antes do INSERT, que teria uma corrida
 * entre o SELECT e o INSERT se "gerar o mes" fosse chamado duas vezes ao
 * mesmo tempo (duas abas, por exemplo).
 *
 * `RETURNING *` so traz quem ENTROU: uma linha em conflito nao aparece no
 * retorno, e e assim que o caso de uso sabe quantas ja existiam.
 */
export function createFixedCostPayableGenerator(sql: Sql): FixedCostPayableGenerator {
  return {
    generate: async (drafts: readonly FixedCostPayableDraft[]) => {
      if (drafts.length === 0) return []

      const companyId = drafts[0]!.companyId

      const linhas = await withTenant(
        sql,
        companyId,
        (tx) => tx<LinhaPayable[]>`
          INSERT INTO payables ${tx(
            drafts.map((d) => ({
              company_id: d.companyId,
              fixed_cost_id: d.fixedCostId,
              supplier: d.supplier,
              description: d.description,
              amount_cents: d.amountCents,
              due_date: d.dueDate,
              account_id: d.accountId,
              created_by: d.createdBy,
              created_at: d.createdAt,
              updated_at: d.createdAt,
            })),
            'company_id',
            'fixed_cost_id',
            'supplier',
            'description',
            'amount_cents',
            'due_date',
            'account_id',
            'created_by',
            'created_at',
            'updated_at',
          )}
          ON CONFLICT (company_id, fixed_cost_id, due_date) WHERE fixed_cost_id IS NOT NULL
            DO NOTHING
          RETURNING id, supplier, description, amount_cents, settled_amount_cents,
                    to_char(due_date, 'YYYY-MM-DD') AS due_date, status, attachment_key,
                    account_id, recurrence_id, occurrence_number, occurrence_count, created_at
        `,
      )

      return linhas.map(paraPayable)
    },
  }
}
