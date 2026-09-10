import { encaminhar } from '@/lib/bff'

/** Recusar um pedido de conexao recebido — ADR-0008, RF-04. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return encaminhar(`/conexoes/${encodeURIComponent(id)}/recusar`, { method: 'POST' })
}
