import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * A trilha de estoque do produto — RF-124.
 *
 * Somente leitura, e da mais recente para tras. Quem escreve na trilha e a
 * venda e o ajuste; ninguem edita um movimento depois de gravado.
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
  const r = await chamarApi(`/produtos/${encodeURIComponent(id)}/movimentos`, { token })

  return r.ok
    ? NextResponse.json(r.dados)
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })
}
