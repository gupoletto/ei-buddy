import type { NextRequest } from 'next/server'
import { encaminhar } from '@/lib/bff'

/** Responder um chamado — NR-080. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  return encaminhar(`/suporte/chamados/${encodeURIComponent(id)}/mensagens`, {
    method: 'POST',
    body: await request.json().catch(() => ({})),
  })
}
