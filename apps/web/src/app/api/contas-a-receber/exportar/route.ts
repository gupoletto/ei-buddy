import type { NextRequest } from 'next/server'
import { encaminharArquivo } from '@/lib/bff'

/** Exportar em CSV ou PDF — mesma ideia de `/api/contas-a-pagar/exportar`. */
export async function GET(request: NextRequest) {
  const formato = request.nextUrl.searchParams.get('formato') ?? 'csv'

  return encaminharArquivo(`/contas-a-receber/exportar?formato=${encodeURIComponent(formato)}`)
}
