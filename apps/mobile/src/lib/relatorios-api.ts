import { chamarApi } from './api'
import type { Resultado } from './contabilidade-api'

/**
 * Faturamento e rankings — NR-077, US-041.
 *
 * As mesmas rotas do web. O app nao soma nada: o ticket medio, os meses zerados
 * e a ordem dos rankings chegam prontos, e sao os mesmos numeros que o
 * assistente vai responder (RF-108). Uma segunda aritmetica aqui apareceria
 * como o celular e o computador discordando sobre o mesmo mes.
 */

export type MesFaturado = {
  /** AAAA-MM. */
  readonly month: string
  readonly grossCents: number
  readonly discountsCents: number
  readonly netCents: number
  readonly salesCount: number
  /** Nulo quando nao houve venda — nao zero. */
  readonly averageTicketCents: number | null
}

export type Faturamento = {
  readonly from: string
  readonly to: string
  readonly months: readonly MesFaturado[]
  readonly totalNetCents: number
}

export type PosicaoDeCliente = {
  readonly customerId: string
  readonly customerName: string
  readonly netCents: number
  readonly salesCount: number
  readonly lastSaleOn: string
}

export type RankingDeClientes = {
  readonly customers: readonly PosicaoDeCliente[]
  /** Venda de balcao sem cliente — RF-033. Fora da lista, dentro do total. */
  readonly unidentifiedCents: number
}

export type PosicaoDeProduto = {
  readonly productId: string
  readonly productName: string
  readonly quantity: number
  readonly netCents: number
}

export type RankingDeProdutos = {
  readonly products: readonly PosicaoDeProduto[]
  /** Item vendido sem produto no cadastro. */
  readonly unlinkedCents: number
}

const periodo = (de: string, ate: string) =>
  `from=${encodeURIComponent(de)}&to=${encodeURIComponent(ate)}`

export async function carregarFaturamento(
  de: string,
  ate: string,
): Promise<Resultado<Faturamento>> {
  const r = await chamarApi<Faturamento>(`/relatorios/faturamento?${periodo(de, ate)}`)
  return r.ok ? { ok: true, dados: r.dados } : { ok: false, erro: r.message }
}

export async function carregarRankingDeClientes(
  de: string,
  ate: string,
): Promise<Resultado<RankingDeClientes>> {
  const r = await chamarApi<RankingDeClientes>(`/relatorios/ranking/clientes?${periodo(de, ate)}`)
  return r.ok ? { ok: true, dados: r.dados } : { ok: false, erro: r.message }
}

export async function carregarRankingDeProdutos(
  de: string,
  ate: string,
): Promise<Resultado<RankingDeProdutos>> {
  const r = await chamarApi<RankingDeProdutos>(`/relatorios/ranking/produtos?${periodo(de, ate)}`)
  return r.ok ? { ok: true, dados: r.dados } : { ok: false, erro: r.message }
}
