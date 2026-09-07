import type { SettlementOutput } from '@na-regua/contracts'
import type {
  NewSettlement,
  SettlementTransaction,
  SettlementUnitOfWork,
  TituloSnapshot,
} from '@na-regua/core'
import type { Sql, TransactionSql } from 'postgres'
import { withTenant } from './tenant.js'

/**
 * Baixa e estorno de titulo no banco — NR-029, RF-063 a RF-067.
 *
 * `core` tinha `settlePayable`, `settleReceivable` e `reverseSettlement` desde
 * a NR-029, com teste contra falso. Faltava quem gravasse — e sem isso nenhuma
 * rota podia expo-los: pagar uma conta, a operacao mais diaria do financeiro,
 * existia no repositorio e nao no produto.
 *
 * ## Duas tabelas, uma porta
 *
 * A baixa de RECEBIVEL vai para `settlements` e a de PAGAVEL para
 * `payable_settlements`. Sao tabelas separadas desde a 0003/0010 porque
 * guardam coisas diferentes: a do recebivel tem `method` (como o cliente
 * pagou) e a do pagavel tem `bank_account` (de qual conta saiu). Forcar as duas
 * numa tabela so deixaria metade das colunas nulas em cada linha, e ninguem
 * saberia quais.
 *
 * A porta e uma so porque a REGRA e uma so — parcial vira
 * `partially_settled`, completa vira `settled`, estorno e uma linha negativa —
 * e essa regra vive em `core`. Aqui embaixo cada uma vai para o seu lugar.
 */

const numero = (v: unknown): number => Number(v)

type LinhaTitulo = {
  id: string
  amount_cents: string | number
  settled_amount_cents: string | number
  status: string
  customer_id: string | null
  payment_method: string | null
}

const paraSnapshot = (l: LinhaTitulo): TituloSnapshot => ({
  id: l.id,
  amountCents: numero(l.amount_cents),
  settledAmountCents: numero(l.settled_amount_cents),
  status: l.status,
  customerId: l.customer_id,
  paymentMethod: l.payment_method as TituloSnapshot['paymentMethod'],
})

type LinhaBaixa = {
  id: string
  payable_id?: string | null
  receivable_id?: string | null
  amount_cents: string | number
  method?: string | null
  bank_account?: string | null
  settled_on?: string | Date | null
  settled_at?: Date | null
  notes: string | null
  reverses_id: string | null
  created_at: Date
  created_by: string | null
}

/**
 * `settled_on` sai como TEXTO, e nunca de um `Date`.
 *
 * O driver devolve `date` como meia-noite UTC, e ler os campos locais desse
 * `Date` em maquina no fuso de Sao Paulo recua um dia — foi assim que todo
 * vencimento apareceu um dia antes. Onde a coluna e `timestamptz`
 * (`settlements.settled_at`), o recorte do ISO ja da o dia em UTC, que e o
 * mesmo instante gravado.
 */
function diaDaBaixa(l: LinhaBaixa): string {
  if (typeof l.settled_on === 'string') return l.settled_on.slice(0, 10)
  if (l.settled_on instanceof Date) return l.settled_on.toISOString().slice(0, 10)
  return (l.settled_at ?? l.created_at).toISOString().slice(0, 10)
}

const paraBaixa = (l: LinhaBaixa): SettlementOutput => ({
  id: l.id,
  payableId: l.payable_id ?? null,
  receivableId: l.receivable_id ?? null,
  amountCents: numero(l.amount_cents),
  method: (l.method ?? null) as SettlementOutput['method'],
  bankAccount: l.bank_account ?? null,
  settledOn: diaDaBaixa(l),
  notes: l.notes,
  reversesId: l.reverses_id,
  createdAt: l.created_at.toISOString(),
  createdBy: l.created_by,
})

function escopo(tx: TransactionSql, companyId: string): SettlementTransaction {
  return {
    /**
     * O titulo a pagar, DENTRO da transacao.
     *
     * Ler aqui e nao fora: entre ler o saldo e grava-lo cabe outra baixa, e o
     * caso de uso decide "parcial ou completa" com base neste numero. Ler antes
     * da transacao decidiria sobre um saldo que ja mudou.
     *
     * `payment_method` volta nulo porque `payables` nao tem a coluna: quem paga
     * um fornecedor informa a CONTA de onde saiu, e nao a forma. A porta declara
     * o campo por causa do recebivel, e aqui a resposta honesta e nula. Como
     * `customer_id` tambem e nulo, `mexeNoSaldoDoCliente` responde nao — que e
     * o certo: conta a pagar nao mexe em fiado de cliente nenhum.
     *
     * Sem filtro de `deleted_at`: a tabela nao tem a coluna, de proposito.
     * "Nada e apagado: conta e cancelada" (RNF-040, 0010). Quem cancelou vira
     * `status = 'cancelled'`, e recusar a baixa de conta cancelada e regra de
     * `core` — nao um sumico silencioso aqui embaixo.
     */
    findPayable: async (_companyId, id) => {
      const [linha] = await tx<LinhaTitulo[]>`
        SELECT id, amount_cents, settled_amount_cents, status,
               NULL::uuid AS customer_id, NULL::text AS payment_method
        FROM payables
        WHERE id = ${id}
      `
      return linha === undefined ? undefined : paraSnapshot(linha)
    },

    /**
     * O recebivel, com a forma de pagamento que veio da VENDA.
     *
     * `receivables` nao guarda `payment_method`, e nao deveria: a forma e um
     * fato do PAGAMENTO, e mora em `payments`. Copiar para o recebivel criaria
     * duas versoes da mesma verdade.
     *
     * Isso importa porque `mexeNoSaldoDoCliente` decide o fiado por ela. Um
     * recebivel de venda no CREDITO nao pode abater o saldo devedor do cliente:
     * quem vai pagar e a adquirente, e nao ele. Ja um de venda na CARTEIRA
     * (fiado) tem de abater.
     *
     * Nulo — recebivel avulso, sem venda — tambem mexe no saldo, e o comentario
     * de `mexeNoSaldoDoCliente` diz por que: alguem lancou uma cobranca nominal,
     * e ela e divida daquela pessoa.
     *
     * `MIN` porque uma venda pode ter mais de um pagamento. Na pratica so o
     * parcelado gera recebivel, e ele e de uma forma so; `MIN` torna a consulta
     * deterministica em vez de depender da ordem que o banco devolver.
     */
    findReceivable: async (_companyId, id) => {
      const [linha] = await tx<LinhaTitulo[]>`
        SELECT r.id, r.amount_cents, r.settled_amount_cents, r.status, r.customer_id,
               (SELECT MIN(p.method) FROM payments p WHERE p.sale_id = r.sale_id)
                 AS payment_method
        FROM receivables r
        WHERE r.id = ${id}
      `
      return linha === undefined ? undefined : paraSnapshot(linha)
    },

    /**
     * Procura a baixa nas DUAS tabelas.
     *
     * Quem estorna tem um id de baixa na mao e nao sabe — nem precisa saber —
     * de qual tabela ele veio. Exigir o tipo junto empurraria para a tela uma
     * distincao que e detalhe de armazenamento.
     */
    findSettlement: async (_companyId, id) => {
      const [doRecebivel] = await tx<LinhaBaixa[]>`
        SELECT id, receivable_id, amount_cents, method, settled_at, notes,
               reverses_id, created_at, created_by
        FROM settlements WHERE id = ${id}
      `
      if (doRecebivel !== undefined) return paraBaixa(doRecebivel)

      const [doPagavel] = await tx<LinhaBaixa[]>`
        SELECT id, payable_id, amount_cents, bank_account, settled_on, notes,
               reverses_id, created_at, created_by
        FROM payable_settlements WHERE id = ${id}
      `
      return doPagavel === undefined ? undefined : paraBaixa(doPagavel)
    },

    /**
     * Ja existe estorno desta baixa? — RF-067.
     *
     * Sem isto, estornar duas vezes gravaria duas linhas negativas e o titulo
     * voltaria a dever mais do que devia. O indice unico do schema tambem
     * recusa, mas descobrir pela violacao de constraint daria ao lojista um
     * erro de banco no lugar de "esta baixa ja foi estornada".
     */
    hasReversal: async (_companyId, settlementId) => {
      const [linha] = await tx<{ existe: boolean }[]>`
        SELECT (
          EXISTS (SELECT 1 FROM settlements WHERE reverses_id = ${settlementId})
          OR
          EXISTS (SELECT 1 FROM payable_settlements WHERE reverses_id = ${settlementId})
        ) AS existe
      `
      return linha?.existe === true
    },

    insertSettlement: async (baixa: NewSettlement) => {
      if (baixa.receivableId !== null) {
        const [linha] = await tx<LinhaBaixa[]>`
          INSERT INTO settlements
            (company_id, receivable_id, amount_cents, method, settled_at, notes,
             reverses_id, created_by, created_at)
          VALUES (${companyId}, ${baixa.receivableId}, ${baixa.amountCents},
                  ${baixa.method ?? 'cash'}, ${baixa.settledOn}, ${baixa.notes},
                  ${baixa.reversesId}, ${baixa.createdBy}, ${baixa.createdAt})
          RETURNING id, receivable_id, amount_cents, method, settled_at, notes,
                    reverses_id, created_at, created_by
        `
        if (linha === undefined) throw new Error('A baixa do recebivel nao foi gravada.')
        return paraBaixa(linha)
      }

      const [linha] = await tx<LinhaBaixa[]>`
        INSERT INTO payable_settlements
          (company_id, payable_id, amount_cents, settled_on, bank_account, notes,
           reverses_id, created_by, created_at)
        VALUES (${companyId}, ${baixa.payableId}, ${baixa.amountCents},
                ${baixa.settledOn}, ${baixa.bankAccount ?? 'nao informada'}, ${baixa.notes},
                ${baixa.reversesId}, ${baixa.createdBy}, ${baixa.createdAt})
        RETURNING id, payable_id, amount_cents, bank_account, settled_on, notes,
                  reverses_id, created_at, created_by
      `
      if (linha === undefined) throw new Error('A baixa da conta a pagar nao foi gravada.')
      return paraBaixa(linha)
    },

    /**
     * Grava o saldo e o status que passam a valer.
     *
     * Absolutos, e nao incrementos: quem decidiu os dois foi o caso de uso, com
     * o titulo lido DENTRO desta mesma transacao. Somar um delta aqui
     * reintroduziria a corrida que ler la dentro evitou.
     *
     * No recebivel, `settled_at` acompanha o status porque o schema EXIGE:
     * `CHECK ((settled_at IS NULL) = (status <> 'settled'))`.
     *
     * Nao e formalidade. O carimbo responde "quando este titulo foi quitado", e
     * um status `settled` sem data seria um recebivel liquidado que ninguem
     * sabe quando entrou — justamente o que se procura ao conferir o caixa. No
     * ESTORNO o caminho e o inverso: o status volta a `open` e a data tem de
     * voltar a ser nula, senao a constraint recusa. Foi ela que pegou isto.
     *
     * `payables` nao tem esse par: la o status basta.
     */
    updateTitulo: async (_companyId, tipo, id, settledAmountCents, status) => {
      const linhas =
        tipo === 'payable'
          ? await tx`
              UPDATE payables
                 SET settled_amount_cents = ${settledAmountCents},
                     status = ${status},
                     updated_at = now()
               WHERE id = ${id}
              RETURNING id
            `
          : await tx`
              UPDATE receivables
                 SET settled_amount_cents = ${settledAmountCents},
                     status = ${status},
                     settled_at = CASE WHEN ${status} = 'settled' THEN now() ELSE NULL END,
                     updated_at = now()
               WHERE id = ${id}
              RETURNING id
            `

      if (linhas.length === 0) {
        /* O caso de uso ja conferiu que existe, e estamos na mesma transacao.
           Chegar aqui e o titulo ter sumido no meio — falhar alto e melhor que
           gravar a baixa sem o titulo correspondente. */
        throw new Error(`Titulo ${id} desapareceu no meio da baixa.`)
      }
    },

    /**
     * Mexe no fiado do cliente — RF-013.
     *
     * Incremento, e nao valor absoluto: aqui o caso de uso sabe QUANTO mudou
     * (o valor da baixa) e nao qual o saldo final. Ler o saldo para somar em
     * JavaScript abriria a corrida que o `+ delta` no proprio UPDATE evita.
     */
    adjustCustomerBalance: async (_companyId, customerId, deltaCents) => {
      await tx`
        UPDATE customers
           SET wallet_balance_cents = wallet_balance_cents + ${deltaCents},
               updated_at = now()
         WHERE id = ${customerId}
      `
    },
  }
}

export function createSettlementUnitOfWork(sql: Sql): SettlementUnitOfWork {
  return {
    transaction: (companyId, fn) => withTenant(sql, companyId, (tx) => fn(escopo(tx, companyId))),
  }
}
