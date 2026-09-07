import type { NextRequest } from 'next/server'
import { encaminhar } from '@/lib/bff'

/** Um chamado — NR-080. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return encaminhar(`/suporte/chamados/${encodeURIComponent(id)}`)
}

/**
 * Marcar lido — a acao de ABRIR o chamado.
 *
 * Separada do `GET` de proposito: recarregar a tela nao pode apagar o aviso de
 * resposta nova. Quem marca e a acao de abrir, e nao a de olhar.
 */
export async function PATCH(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return encaminhar(`/suporte/chamados/${encodeURIComponent(id)}`, { method: 'PATCH' })
}
