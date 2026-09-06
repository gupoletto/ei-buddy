import { encaminhar } from '@/lib/bff'

/** Importacao de clientes em lote — NR-072, US-008. Ver a de produtos. */
export async function POST(request: Request) {
  const corpo = await request.json().catch(() => ({}))

  return encaminhar('/clientes/importacao', { method: 'POST', body: corpo })
}
