import type { ReceivableOutput, ReceivableStatus } from '@na-regua/contracts'
import type { CompanyId } from '../context.js'

/**
 * Porta de leitura dos recebiveis — RF-064, RF-066.
 *
 * So LEITURA. Quem cria recebivel e a venda (`UnitOfWork`), e quem o baixa e o
 * `SettlementUnitOfWork` — os dois escrevem em mais de uma tabela na mesma
 * transacao, e essa responsabilidade ja tem dono. Uma porta de escrita aqui
 * criaria um segundo caminho para mexer no mesmo saldo.
 *
 * `companyId` em toda assinatura por decisao: o isolamento nao pode depender de
 * quem chama lembrar de filtrar.
 */
export type ReceivableQueries = {
  /**
   * Recebiveis da loja, filtrados por situacao.
   *
   * O filtro e do SQL e nao do chamador: a lista de "o que tenho a receber"
   * ignora o que ja foi recebido, e trazer tudo para descartar depois cresce
   * com o historico da loja — que e justamente o que nao para de crescer.
   */
  list(
    companyId: CompanyId,
    criterio: { readonly status: readonly ReceivableStatus[] },
  ): Promise<readonly ReceivableOutput[]>
}
