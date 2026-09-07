import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * A ficha de um produto — RF-017.
 *
 * Rota dinamica, irma das estaticas `/api/produtos/catalogo`, `/resumo` e
 * `/importacao`. O Next casa segmento estatico antes de dinamico, entao elas
 * continuam sendo elas mesmas e nao ids.
 *
 * Repassa o STATUS da api: o 404 dela cobre "nao existe" e "e de outra loja"
 * com a mesma resposta, de proposito.
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
  const r = await chamarApi(`/produtos/${encodeURIComponent(id)}`, { token })

  return r.ok
    ? NextResponse.json(r.dados)
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })
}
