import { encaminhar } from '@/lib/bff'

/**
 * Importacao de catalogo em lote — NR-072, US-008.
 *
 * O corpo vai inteiro para a api, que valida a forma de cada linha e devolve
 * quantas entraram e o motivo de cada recusa. O BFF nao filtra nem "conserta"
 * linha nenhuma: a validacao acontecer duas vezes, com regras que podem
 * divergir, e o jeito mais provavel de a tela dizer "importado" para algo que
 * nao entrou.
 */
export async function POST(request: Request) {
  const corpo = await request.json().catch(() => ({}))

  return encaminhar('/produtos/importacao', { method: 'POST', body: corpo })
}
