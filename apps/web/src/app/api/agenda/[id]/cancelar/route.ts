import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * Cancelar compromisso — RF-092.
 *
 * `POST .../cancelar` e nao `DELETE`, como na api: nada e apagado (RNF-040).
 * O compromisso sai da agenda do dia e continua respondendo por id — `DELETE`
 * prometeria o contrario para quem le a rota.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value

  if (token === undefined) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Entre na sua conta para continuar.' } },
      { status: 401 },
    )
  }

  const { id } = await params
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const r = await chamarApi(`/agenda/${encodeURIComponent(id)}/cancelar`, {
    method: 'POST',
    body: corpo,
    token,
  })

  return r.ok
    ? NextResponse.json(r.dados)
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })
}
