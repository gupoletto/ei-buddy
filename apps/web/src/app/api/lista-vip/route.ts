import { NextResponse } from 'next/server'
import { chamarApi } from '@/lib/api-server'
import { corpoDe } from '@/lib/bff'

/**
 * Lista de espera do pre-lancamento — NR-111.
 *
 * NAO usa `encaminhar`: esta rota e publica, e `encaminhar` exige o cookie de
 * sessao. Quem responde a pesquisa nao tem conta — mesmo padrao de
 * `app/api/auth/signup/route.ts`.
 */
export async function POST(request: Request) {
  const corpo = await corpoDe(request)

  const r = await chamarApi('/lista-vip', { method: 'POST', body: corpo })

  return NextResponse.json(
    r.ok ? r.dados : (r.corpo ?? { error: { code: r.code, message: r.message } }),
    {
      status: r.status,
    },
  )
}
