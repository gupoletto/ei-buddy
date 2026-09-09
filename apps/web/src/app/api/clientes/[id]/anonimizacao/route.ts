import type { NextRequest } from 'next/server'
import { corpoDe, encaminhar } from '@/lib/bff'

/**
 * Anonimizacao de cliente — NR-086, RF-127, RF-128.
 *
 * `POST` numa subcolecao, e nao `DELETE` no cliente: o titular pediu exclusao e
 * recebe anonimizacao. O `id` fica, as vendas ficam, os campos pessoais somem —
 * apagar mudaria os totais de periodos ja fechados.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/clientes/[id]/anonimizacao'>,
) {
  const { id } = await ctx.params

  return encaminhar(`/clientes/${encodeURIComponent(id)}/anonimizacao`, {
    method: 'POST',
    body: await corpoDe(request),
  })
}
