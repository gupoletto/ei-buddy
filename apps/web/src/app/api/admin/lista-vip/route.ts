import type { NextRequest } from 'next/server'
import { encaminharComChave } from '@/lib/bff'

/** Painel do Super Admin: lista paginada das respostas — NR-111. */
export async function GET(request: NextRequest) {
  const { search } = request.nextUrl

  return encaminharComChave(`/admin/lista-vip${search}`, request)
}
