import { encaminhar } from '@/lib/bff'

/** Cancelar um pedido pendente, ou desfazer uma conexao aceita — ADR-0008, RF-05. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return encaminhar(`/conexoes/${encodeURIComponent(id)}/encerrar`, { method: 'POST' })
}
