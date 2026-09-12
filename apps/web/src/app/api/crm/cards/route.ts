import type { NextRequest } from 'next/server'
import { encaminhar } from '@/lib/bff'

/** O quadro de CRM — NR-109. */
export async function GET() {
  return encaminhar('/crm/cards')
}

export async function POST(request: NextRequest) {
  return encaminhar('/crm/cards', {
    method: 'POST',
    body: await request.json().catch(() => ({})),
  })
}
