import { encaminhar } from '@/lib/bff'

/** Sai do modo Super Admin — ADR-0007. */
export async function POST() {
  return encaminhar('/admin/sair', { method: 'POST' })
}
