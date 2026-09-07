import { encaminhar } from '@/lib/bff'

/**
 * O perfil de quem esta logado — NR-013, RF-119.
 *
 * Separada de `/api/session`, que serve para ENTRAR e SAIR. Esta responde
 * "quem sou eu, e em qual loja", e e o que a barra do topo pergunta ao abrir.
 */
export async function GET() {
  return encaminhar('/auth/perfil')
}
