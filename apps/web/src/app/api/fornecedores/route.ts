import { encaminhar } from '@/lib/bff'

/** Buscar quem vende um produto, perto de mim — ADR-0008, RF-01, RF-02. */
export async function GET(request: Request) {
  const termo = new URL(request.url).searchParams.get('termo') ?? ''
  return encaminhar(`/fornecedores?termo=${encodeURIComponent(termo)}`)
}
