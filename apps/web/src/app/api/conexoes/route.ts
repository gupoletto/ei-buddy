import { corpoDe, encaminhar } from '@/lib/bff'

/**
 * Pedir e listar conexoes — ADR-0008, RF-04, RF-05.
 */
export async function GET() {
  return encaminhar('/conexoes')
}

export async function POST(request: Request) {
  return encaminhar('/conexoes', { method: 'POST', body: await corpoDe(request) })
}
