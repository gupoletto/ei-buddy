import type { NextRequest } from 'next/server'
import { encaminharArquivo } from '@/lib/bff'

/** Exportar em CSV ou PDF — o botao "Exportar" que a tela ja tinha. */
export async function GET(request: NextRequest) {
  const formato = request.nextUrl.searchParams.get('formato') ?? 'csv'

  return encaminharArquivo(`/contas-a-pagar/exportar?formato=${encodeURIComponent(formato)}`)
}
