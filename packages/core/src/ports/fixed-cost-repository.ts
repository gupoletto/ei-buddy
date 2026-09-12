import type { FixedCostOutput, PayableOutput } from '@na-regua/contracts'
import type { CompanyId, UserId } from '../context.js'

/**
 * Porta dos custos fixos — NR-110.
 *
 * `FixedCostRepository` e o CRUD do molde. `FixedCostPayableGenerator` e o
 * "gerar as contas do mes" — escrita PROPRIA, e nao reaproveitando
 * `PayableUnitOfWork`: a garantia que esse caso de uso precisa e diferente
 * (inserir ignorando quem ja foi gerado neste mes, atomicamente, via
 * `ON CONFLICT` no indice unico da migration), e misturar as duas portas
 * faria quem le `PayableUnitOfWork` se perguntar por que existe um metodo que
 * "as vezes nao insere".
 */

export type NewFixedCost = {
  readonly companyId: CompanyId
  readonly name: string
  readonly amountCents: number
  readonly dueDay: number
  readonly accountId: string | null
  readonly createdBy: UserId
  readonly createdAt: Date
}

export type FixedCostChanges = {
  readonly name: string
  readonly amountCents: number
  readonly dueDay: number
  readonly accountId: string | null
}

export type FixedCostRepository = {
  list(companyId: CompanyId): Promise<readonly FixedCostOutput[]>
  findById(companyId: CompanyId, id: string): Promise<FixedCostOutput | undefined>
  insert(novo: NewFixedCost): Promise<FixedCostOutput>
  update(companyId: CompanyId, id: string, mudancas: FixedCostChanges): Promise<FixedCostOutput>
  remove(companyId: CompanyId, id: string): Promise<void>
}

/** Uma conta a pagar pronta para nascer de um custo fixo, neste mes. */
export type FixedCostPayableDraft = {
  readonly fixedCostId: string
  readonly companyId: CompanyId
  readonly supplier: string
  readonly description: string
  readonly amountCents: number
  /** `AAAA-MM-DD`, ja com o dia ajustado ao tamanho do mes. */
  readonly dueDate: string
  readonly accountId: string | null
  readonly createdBy: UserId
  readonly createdAt: Date
}

export type FixedCostPayableGenerator = {
  /**
   * Insere os rascunhos, ignorando quem ja tem conta gerada para o MESMO
   * vencimento — devolve so as que de fato entraram. A diferenca entre
   * `drafts.length` e o retorno e quantas ja existiam.
   */
  generate(drafts: readonly FixedCostPayableDraft[]): Promise<readonly PayableOutput[]>
}
