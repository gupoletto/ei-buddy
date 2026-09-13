import type { NextRequest } from 'next/server'
import { encaminharComChave } from '@/lib/bff'

/** Painel do Super Admin: agregados da lista de espera — NR-111. */
export async function GET(request: NextRequest) {
  return encaminharComChave('/admin/lista-vip/resumo', request)
}
