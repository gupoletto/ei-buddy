import type { NextRequest } from 'next/server'
import { corpoDe, encaminhar } from '@/lib/bff'

/** Editar um custo fixo — NR-110. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/custos-fixos/[id]'>) {
  const { id } = await ctx.params

  return encaminhar(`/custos-fixos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: await corpoDe(request),
  })
}

/** Excluir um custo fixo — NR-110. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/custos-fixos/[id]'>) {
  const { id } = await ctx.params

  return encaminhar(`/custos-fixos/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
