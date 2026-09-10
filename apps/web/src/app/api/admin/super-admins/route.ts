import { corpoDe, encaminhar } from '@/lib/bff'

/** Quem e Super Admin, e conceder acesso a mais gente — ADR-0007, RF-131. */
export async function GET() {
  return encaminhar('/admin/super-admins')
}

export async function POST(request: Request) {
  return encaminhar('/admin/super-admins', { method: 'POST', body: await corpoDe(request) })
}
