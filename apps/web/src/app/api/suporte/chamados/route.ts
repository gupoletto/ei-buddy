import type { NextRequest } from 'next/server'
import { encaminhar } from '@/lib/bff'

/** Chamados de suporte — NR-080, US-062. */
export async function GET() {
  return encaminhar('/suporte/chamados')
}

export async function POST(request: NextRequest) {
  return encaminhar('/suporte/chamados', {
    method: 'POST',
    body: await request.json().catch(() => ({})),
  })
}
