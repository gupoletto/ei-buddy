import { encaminhar } from '@/lib/bff'

/**
 * Toda empresa cadastrada, para o painel do Super Admin — ADR-0007, RF-131.
 */
export async function GET() {
  return encaminhar('/admin/empresas')
}
