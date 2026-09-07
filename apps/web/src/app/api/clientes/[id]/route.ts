import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * A ficha de um cliente — RF-011.
 *
 * Rota separada de `/api/clientes` porque o Next casa segmento estatico antes
 * de dinamico: `/api/clientes/importacao` continua sendo a importacao, e nao um
 * cliente de id "importacao".
 *
 * Repassa o STATUS da api sem traduzir. O 404 dela cobre tanto "nao existe"
 * quanto "e de outra loja", de proposito — um 403 confirmaria que aquele id
 * existe em algum lugar.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value

  if (token === undefined) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Entre na sua conta para continuar.' } },
      { status: 401 },
    )
  }

  const { id } = await params
  const r = await chamarApi(`/clientes/${encodeURIComponent(id)}`, { token })

  return r.ok
    ? NextResponse.json(r.dados)
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })
}
