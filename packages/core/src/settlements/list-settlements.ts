import type { SettlementOutput } from '@na-regua/contracts'
import type { ExecutionContext } from '../context.js'
import type { SettlementQueries } from '../ports/settlement-writers.js'

/**
 * As baixas de um titulo, da mais recente para a mais antiga — RF-067.
 *
 * ## Por que precisa existir
 *
 * O estorno pede o id da BAIXA (`POST /baixas/:id/estorno`). A decisao esta em
 * `reverse-settlement.ts` e e a certa — o passado nao se apaga, o estorno e uma
 * linha nova e negativa —, mas ela cobra um preco: quem quer estornar tem de
 * saber QUAL baixa. Nenhuma listagem de titulo devolvia isso.
 *
 * ## Sem `assertCanWrite`
 *
 * E leitura. O `accountant` precisa ver o historico de baixas para conferir o
 * caixa, e exigir papel de escrita o impediria — mesma decisao das outras
 * consultas.
 *
 * ## O estorno aparece na lista
 *
 * Como linha negativa, junto das baixas. Esconde-lo faria a soma da lista
 * discordar do saldo baixado do titulo, e quem confere o caixa veria uma baixa
 * aparentemente nao desfeita. A tela decide o que fazer com o sinal; o caso de
 * uso nao omite fato nenhum.
 */
export type ListSettlementsDeps = { readonly settlements: SettlementQueries }

export async function listSettlements(
  deps: ListSettlementsDeps,
  ctx: ExecutionContext,
  input: { readonly tipo: 'payable' | 'receivable'; readonly tituloId: string },
): Promise<readonly SettlementOutput[]> {
  return deps.settlements.listByTitulo(ctx.companyId, input.tipo, input.tituloId)
}
