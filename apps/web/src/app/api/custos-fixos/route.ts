import { corpoDe, encaminhar } from '@/lib/bff'

/** Custos fixos — NR-110. */
export async function GET() {
  return encaminhar('/custos-fixos')
}

export async function POST(request: Request) {
  return encaminhar('/custos-fixos', {
    method: 'POST',
    body: await corpoDe(request),
  })
}
