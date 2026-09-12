import type { FixedCostOutput, PayableOutput } from '@na-regua/contracts'
import type { CompanyId } from '../context.js'
import type {
  FixedCostChanges,
  FixedCostPayableDraft,
  FixedCostPayableGenerator,
  FixedCostRepository,
  NewFixedCost,
} from '../ports/fixed-cost-repository.js'

/**
 * Custos fixos em memoria, com filtro por empresa de verdade — mesmo
 * criterio das outras portas falsas do pacote.
 */
export class InMemoryFixedCosts implements FixedCostRepository {
  private readonly custos = new Map<string, FixedCostOutput & { companyId: CompanyId }>()
  private sequencia = 0

  async list(companyId: CompanyId): Promise<readonly FixedCostOutput[]> {
    return [...this.custos.values()]
      .filter((c) => c.companyId === companyId)
      .map((c) => this.semTenant(c))
  }

  async findById(companyId: CompanyId, id: string): Promise<FixedCostOutput | undefined> {
    const achado = this.custos.get(id)
    return achado?.companyId === companyId ? this.semTenant(achado) : undefined
  }

  async insert(novo: NewFixedCost): Promise<FixedCostOutput> {
    this.sequencia += 1
    const gravado = {
      id: `custo-${this.sequencia}`,
      companyId: novo.companyId,
      name: novo.name,
      amountCents: novo.amountCents,
      dueDay: novo.dueDay,
      accountId: novo.accountId,
      accountName: null,
      createdAt: novo.createdAt.toISOString(),
    }
    this.custos.set(gravado.id, gravado)
    return this.semTenant(gravado)
  }

  async update(
    companyId: CompanyId,
    id: string,
    mudancas: FixedCostChanges,
  ): Promise<FixedCostOutput> {
    const atual = this.custos.get(id)
    if (atual === undefined || atual.companyId !== companyId) {
      throw new Error(`custo fixo ${id} nao encontrado para a empresa ${companyId}`)
    }
    const atualizado = { ...atual, ...mudancas }
    this.custos.set(id, atualizado)
    return this.semTenant(atualizado)
  }

  async remove(companyId: CompanyId, id: string): Promise<void> {
    const atual = this.custos.get(id)
    if (atual === undefined || atual.companyId !== companyId) {
      throw new Error(`custo fixo ${id} nao encontrado para a empresa ${companyId}`)
    }
    this.custos.delete(id)
  }

  private semTenant<T extends { companyId: CompanyId }>(registro: T): Omit<T, 'companyId'> {
    const { companyId: _omitido, ...resto } = registro
    return resto
  }
}

/**
 * O gerador de contas a partir de custos fixos, em memoria.
 *
 * Aplica a MESMA idempotencia do indice unico real: `(companyId, fixedCostId,
 * dueDate)` so entra uma vez. Um falso que sempre inserisse passaria no teste
 * de geracao sem provar a garantia que o caso de uso promete.
 */
export class InMemoryFixedCostGenerator implements FixedCostPayableGenerator {
  private readonly gravadas = new Set<string>()
  private sequencia = 0
  readonly payables: PayableOutput[] = []

  async generate(drafts: readonly FixedCostPayableDraft[]): Promise<readonly PayableOutput[]> {
    const geradas: PayableOutput[] = []

    for (const d of drafts) {
      const chave = `${d.companyId}:${d.fixedCostId}:${d.dueDate}`
      if (this.gravadas.has(chave)) continue
      this.gravadas.add(chave)

      this.sequencia += 1
      const gravada: PayableOutput = {
        id: `pay-${this.sequencia}`,
        supplier: d.supplier,
        description: d.description,
        amountCents: d.amountCents,
        settledAmountCents: 0,
        dueDate: d.dueDate,
        status: 'open',
        attachmentKey: null,
        accountId: d.accountId,
        recurrenceId: null,
        occurrenceNumber: null,
        occurrenceCount: null,
        createdAt: d.createdAt.toISOString(),
      }
      this.payables.push(gravada)
      geradas.push(gravada)
    }

    return geradas
  }
}
