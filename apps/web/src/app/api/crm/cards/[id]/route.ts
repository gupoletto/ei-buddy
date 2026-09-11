import type { NextRequest } from 'next/server'
import { encaminhar } from '@/lib/bff'

/** Mover um card entre colunas — NR-109. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return encaminhar(`/crm/cards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: await request.json().catch(() => ({})),
  })
}
