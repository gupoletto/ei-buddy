/**
 * Lista de espera do pre-lancamento — NR-111.
 *
 * Sem `pedir()` de proposito: aquele helper e para a area logada, onde toda
 * chamada e `same-origin` com cookie de sessao. Aqui nao ha sessao — e o
 * mesmo motivo pelo qual a rota do lado da api nao passa por
 * `requireContext`.
 */

export type PainPoint =
  | 'cash_flow'
  | 'more_customers'
  | 'sales_organization'
  | 'inventory'
  | 'collections'
  | 'routine'
  | 'profit_visibility'
  | 'marketing'
  | 'other'

export type UsesSystem = 'none' | 'complicated' | 'expensive' | 'satisfied' | 'other'

export type FairPrice =
  'up_to_29' | 'from_30_to_49' | 'from_50_to_69' | 'from_70_to_99' | 'above_100' | 'not_sure'

export type DadosListaVip = {
  name: string
  businessType?: string
  phone: string
  expectation: string
  painPoints?: PainPoint[]
  painPointOther?: string
  usesSystem?: UsesSystem
  usesSystemOther?: string
  fairPrice?: FairPrice
  wantsUpdates?: boolean
}

export async function enviarListaVip(
  dados: DadosListaVip,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let resposta: Response
  try {
    resposta = await fetch('/api/lista-vip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dados),
    })
  } catch {
    return { ok: false, error: 'Sem conexão. Verifique sua internet.' }
  }

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } }
    return { ok: false, error: corpo.error?.message ?? 'Não foi possível enviar. Tente de novo.' }
  }

  return { ok: true }
}
