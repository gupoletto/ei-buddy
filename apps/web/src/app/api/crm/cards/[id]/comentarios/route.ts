import type { NextRequest } from 'next/server'
import { encaminhar } from '@/lib/bff'

/** Comentar num card — NR-109. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return encaminhar(`/crm/cards/${encodeURIComponent(id)}/comentarios`, {
    method: 'POST',
    body: await request.json().catch(() => ({})),
  })
}
