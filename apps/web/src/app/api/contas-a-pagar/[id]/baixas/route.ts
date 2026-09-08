import type { NextRequest } from 'next/server'
import { corpoDe, encaminhar } from '@/lib/bff'

/** O historico de baixas de uma conta a pagar — RF-067. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/contas-a-pagar/[id]/baixas'>,
) {
  const { id } = await ctx.params

  return encaminhar(`/contas-a-pagar/${encodeURIComponent(id)}/baixas`)
}

/** Baixar, total ou parcial — RF-059. */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/contas-a-pagar/[id]/baixas'>,
) {
  const { id } = await ctx.params

  return encaminhar(`/contas-a-pagar/${encodeURIComponent(id)}/baixas`, {
    method: 'POST',
    body: await corpoDe(request),
  })
}
