import { corpoDe, encaminhar } from '@/lib/bff'

/**
 * Exportacao completa — NR-086, RF-125, RF-126.
 *
 * `POST` porque a exportacao GRAVA: um pacote no destino e uma linha na trilha
 * de auditoria. Com `GET`, um pre-carregador de navegador dispararia exportacoes
 * da base inteira sem ninguem clicar.
 */
export async function POST(request: Request) {
  return encaminhar('/privacidade/exportacoes', {
    method: 'POST',
    body: await corpoDe(request),
  })
}
