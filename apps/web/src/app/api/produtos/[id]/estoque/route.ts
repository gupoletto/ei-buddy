import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * Saldo e ajuste de inventario — RF-022, RF-023.
 *
 * O ajuste estava sendo prometido e nao feito: a tela chamava um
 * `delay(700)` e dizia "Ajuste registrado no historico" sem gravar nada. O
 * lojista corrigia a contagem, via a confirmacao, e o saldo continuava errado
 * — pior do que nao ter o botao, porque ele acreditava.
 *
 * O corpo traz a contagem ABSOLUTA e o motivo, como a api pede. O `productId`
 * vem do caminho; o do corpo, se vier, e ignorado la.
 */
async function comToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

const semSessao = () =>
  NextResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Entre na sua conta para continuar.' } },
    { status: 401 },
  )

const repassar = (r: Awaited<ReturnType<typeof chamarApi>>, status = 200) =>
  r.ok
    ? NextResponse.json(r.dados, { status })
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await comToken()
  if (token === undefined) return semSessao()

  const { id } = await params

  return repassar(await chamarApi(`/produtos/${encodeURIComponent(id)}/estoque`, { token }))
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await comToken()
  if (token === undefined) return semSessao()

  const { id } = await params
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>

  /* 201 e nao 200: o ajuste CRIA uma linha na trilha. O saldo e consequencia,
     e o movimento e o fato (RF-124). */
  return repassar(
    await chamarApi(`/produtos/${encodeURIComponent(id)}/estoque`, {
      method: 'POST',
      body: corpo,
      token,
    }),
    201,
  )
}
