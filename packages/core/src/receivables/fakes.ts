import type { ReceivableOutput, ReceivableStatus } from '@na-regua/contracts'
import type { CompanyId } from '../context.js'
import type { ReceivableQueries } from '../ports/receivable-repository.js'

/**
 * Recebiveis em memoria, para teste do caso de uso.
 *
 * Aplica o filtro por empresa e o de situacao **de verdade**, como o SQL. Um
 * falso que devolvesse tudo faria o teste de isolamento medir o vazio, e
 * deixaria passar um caso de uso que esquecesse de pedir so os abertos — o
 * defeito apareceria como "a lista mostra contas que ja foram recebidas", na
 * loja com historico, que e a que menos pode desconfiar do numero.
 */
export class InMemoryReceivables implements ReceivableQueries {
  private readonly registros: (ReceivableOutput & { companyId: CompanyId })[] = []
  private sequencia = 0

  /** Acrescenta um recebivel. Tudo tem padrao menos o que o teste quer dizer. */
  adicionar(
    companyId: CompanyId,
    dados: Partial<ReceivableOutput> & { dueDate: string },
  ): ReceivableOutput {
    this.sequencia += 1
    const gravado = {
      id: `rec-${this.sequencia}`,
      companyId,
      saleId: null,
      customerId: null,
      customerName: null,
      description: 'Venda no balcao',
      amountCents: 10_000,
      netAmountCents: 10_000,
      settledAmountCents: 0,
      installmentNumber: 1,
      installmentCount: 1,
      status: 'open' as ReceivableStatus,
      createdAt: '2026-09-01T12:00:00.000Z',
      ...dados,
    }
    this.registros.push(gravado)
    return gravado
  }

  async list(
    companyId: CompanyId,
    criterio: { readonly status: readonly ReceivableStatus[] },
  ): Promise<readonly ReceivableOutput[]> {
    return (
      this.registros
        .filter((r) => r.companyId === companyId)
        .filter((r) => criterio.status.length === 0 || criterio.status.includes(r.status))
        /* Ordena como o SQL (`ORDER BY due_date`): um falso sem isso deixaria
         passar uma consulta sem ordenacao. */
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map(({ companyId: _omitido, ...resto }) => resto)
    )
  }
}
