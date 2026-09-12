import { corpoDe, encaminhar } from '@/lib/bff'

/** Gerar as contas a pagar do mes, a partir dos custos fixos — NR-110. */
export async function POST(request: Request) {
  return encaminhar('/custos-fixos/gerar', {
    method: 'POST',
    body: await corpoDe(request),
  })
}
