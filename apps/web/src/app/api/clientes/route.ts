import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { SESSION_COOKIE } from '@/lib/session'

/**
 * Cadastro de cliente — NR-072, RF-009, RF-010.
 *
 * Mesmo desenho da sessao (NR-013): o navegador fala com este handler, e o
 * token da api fica no cookie `httpOnly`, fora do alcance do JavaScript da
 * pagina. Ver `api-server.ts`.
 */

type ClienteDaApi = {
  id: string
  name: string
  document: string | null
  phone: string | null
  email: string | null
}

export async function POST(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value

  if (token === undefined) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Entre na sua conta para continuar.' } },
      { status: 401 },
    )
  }

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const { searchParams } = new URL(request.url)

  /*
   * `?duplicado=permitir` atravessa. A api responde 409 com os candidatos
   * quando acha telefone ou documento repetido, e quem decide reusar ou nao e
   * quem esta no balcao — repassar a decisao e o ponto.
   */
  const permitir = searchParams.get('duplicado') === 'permitir'
  const caminho = permitir ? '/clientes?duplicado=permitir' : '/clientes'

  const r = await chamarApi<ClienteDaApi>(caminho, { method: 'POST', body: corpo, token })

  if (!r.ok) {
    /*
     * Repassa o CORPO BRUTO, e nao so codigo e mensagem.
     *
     * O 409 de duplicado traz `candidates` fora do envelope de erro — sao a
     * informacao que permite decidir, e reconstruir a resposta so com o
     * envelope os perderia aqui, a um passo da tela que precisa mostra-los.
     */
    const corpo = r.corpo ?? { error: { code: r.code, message: r.message } }
    return NextResponse.json(corpo, { status: r.status })
  }

  return NextResponse.json(r.dados, { status: 201 })
}

/**
 * A lista de clientes — RF-011, US-036.
 *
 * Os parametros so viajam quando VIERAM. Mandar `q=` ou `page=` vazios faria a
 * api validar string vazia como numero e recusar o pedido inteiro, quando a
 * intencao era usar o padrao dela.
 */
export async function GET(request: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value

  if (token === undefined) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Entre na sua conta para continuar.' } },
      { status: 401 },
    )
  }

  const params = new URL(request.url).searchParams
  const query = new URLSearchParams()
  for (const chave of ['q', 'filter', 'page', 'pageSize']) {
    const valor = params.get(chave)
    if (valor !== null && valor !== '') query.set(chave, valor)
  }

  const r = await chamarApi(`/clientes?${query.toString()}`, { token })

  return r.ok
    ? NextResponse.json(r.dados)
    : NextResponse.json(r.corpo ?? { error: { code: r.code, message: r.message } }, {
        status: r.status,
      })
}
