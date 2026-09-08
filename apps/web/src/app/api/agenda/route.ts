import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * A agenda — NR-036, RF-089 a RF-093.
 *
 * Mesmo desenho das outras: o navegador fala com este handler e o token da api
 * fica no cookie `httpOnly`, fora do alcance do JavaScript da pagina.
 */

async function comToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

const semSessao = () =>
  NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Entre na sua conta para continuar.' } },
    { status: 401 },
  )

/**
 * Repassa os parametros que VIERAM, e so eles.
 *
 * Mandar `de=` vazio faria a api validar string vazia como data e recusar o
 * pedido inteiro — quando a intencao era usar o outro recorte.
 */
export async function GET(request: Request) {
  const token = await comToken()
  if (token === undefined) return semSessao()

  const params = new URL(request.url).searchParams
  const query = new URLSearchParams()
  for (const chave of ['dia', 'de', 'ate']) {
    const valor = params.get(chave)
    if (valor !== null && valor !== '') query.set(chave, valor)
  }

  const r = await chamarApi(`/agenda?${query.toString()}`, { token })

  return r.ok
    ? NextResponse.json(r.dados)
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })
}

export async function POST(request: Request) {
  const token = await comToken()
  if (token === undefined) return semSessao()

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const r = await chamarApi('/agenda', { method: 'POST', body: corpo, token })

  return r.ok
    ? NextResponse.json(r.dados, { status: 201 })
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })
}
