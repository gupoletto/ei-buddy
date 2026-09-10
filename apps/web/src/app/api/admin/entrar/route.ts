import { corpoDe, encaminhar } from '@/lib/bff'

/**
 * Entrar numa empresa como Super Admin — ADR-0007, RF-131.
 *
 * Ao contrario de `/api/session/empresa`, nao reescreve o cookie: o mesmo
 * token continua valendo, so a sessao no servidor muda de estado.
 */
export async function POST(request: Request) {
  return encaminhar('/admin/entrar', { method: 'POST', body: await corpoDe(request) })
}
