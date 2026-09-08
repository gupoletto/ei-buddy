import type { NextRequest } from 'next/server'
import { corpoDe, encaminhar } from '@/lib/bff'

/**
 * Estorno de baixa — RF-067.
 *
 * O `:id` e o da BAIXA, e nao o do titulo. E o caminho nao diz se ela e de
 * conta a pagar ou a receber: quem estorna tem o id na mao e nao precisa saber
 * em qual tabela ele mora — o servidor procura nas duas.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/baixas/[id]/estorno'>) {
  const { id } = await ctx.params

  return encaminhar(`/baixas/${encodeURIComponent(id)}/estorno`, {
    method: 'POST',
    body: await corpoDe(request),
  })
}
