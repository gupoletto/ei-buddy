import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * O cadastro da propria loja — RF-003.
 *
 * `/empresa` no singular: a empresa e a do contexto, e sempre sera. Um id no
 * caminho seria um parametro que so pode ter um valor, e um convite a tentar
 * outro.
 */

async function comToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

const semSessao = () =>
  NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Entre na sua conta para continuar.' } },
    { status: 401 },
  )

const repassar = (r: Awaited<ReturnType<typeof chamarApi>>) =>
  r.ok
    ? NextResponse.json(r.dados)
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })

export async function GET() {
  const token = await comToken()
  if (token === undefined) return semSessao()

  return repassar(await chamarApi('/empresa', { token }))
}

export async function PUT(request: Request) {
  const token = await comToken()
  if (token === undefined) return semSessao()

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>

  /* O corpo atravessa como veio. O contrato e `.strict()` e parcial: quem
     mandar CNPJ recebe 400 da api, e nao um 200 que ignorou o campo. */
  return repassar(await chamarApi('/empresa', { method: 'PUT', body: corpo, token }))
}
