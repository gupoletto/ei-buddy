import type { NextRequest } from 'next/server'
import { corpoDe, encaminhar } from '@/lib/bff'

/** O historico de baixas de um recebivel — RF-067. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/contas-a-receber/[id]/baixas'>,
) {
  const { id } = await ctx.params

  return encaminhar(`/contas-a-receber/${encodeURIComponent(id)}/baixas`)
}

/** Baixar recebimento — RF-066. Mexe no fiado do cliente, a de pagar nao. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/contas-a-receber/[id]/baixas'>,
) {
  const { id } = await ctx.params

  return encaminhar(`/contas-a-receber/${encodeURIComponent(id)}/baixas`, {
    method: 'POST',
    body: await corpoDe(request),
  })
}
