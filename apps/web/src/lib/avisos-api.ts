import { pedir } from './http'

/**
 * O que precisa da atencao do lojista agora — NR-013.
 *
 * ## O que este modulo NAO faz
 *
 * Nao inventa notificacao. O sino da barra do topo tinha um ponto vermelho
 * FIXO no HTML: ele estava sempre aceso, em toda loja, desde o primeiro
 * segundo. Um aviso que nunca apaga deixa de ser aviso — quem o ve todo dia
 * para de olhar, e no dia em que houver algo de verdade ele nao vai chamar
 * atencao nenhuma.
 *
 * Entao aqui so entra sinal que sai de dado REAL, com rota propria:
 *
 * - produto abaixo do minimo, de `GET /produtos/resumo`;
 * - conta a pagar vencida, de `GET /contas-a-pagar`.
 *
 * Os chamados de suporte ficam de fora de proposito, apesar de a tela deles ja
 * mostrar "resposta nova": aquele numero vem de `lib/mock-data`, e alimentar o
 * sino com ele seria trocar um ponto sempre aceso por um ponto que mente com
 * mais convicção.
 */

export type Aviso = {
  /** Curto: o sino e estreito. */
  readonly texto: string
  readonly href: string
  readonly tom: 'atencao' | 'perigo'
}

type ResumoDoCatalogo = {
  belowMinimum: number
  outOfStock: number
}

type ContasAgrupadas = {
  temVencidas: boolean
  grupos: { faixa: string; itens: unknown[] }[]
}

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos)

/**
 * Busca os sinais em paralelo e ignora quem falhar.
 *
 * Um aviso que nao carregou nao pode derrubar os outros nem a barra do topo: o
 * sino e acessorio da tela, e uma falha nele nao deve impedir o lojista de
 * vender. Quem falhou simplesmente nao aparece.
 */
export async function carregarAvisos(): Promise<Aviso[]> {
  const [catalogo, contas] = await Promise.all([
    pedir<ResumoDoCatalogo>('/api/produtos/resumo'),
    pedir<ContasAgrupadas>('/api/contas-a-pagar'),
  ])

  const avisos: Aviso[] = []

  if (catalogo.ok && catalogo.dados.outOfStock > 0) {
    const n = catalogo.dados.outOfStock
    avisos.push({
      texto: `${n} ${plural(n, 'produto esgotado', 'produtos esgotados')}`,
      href: '/app/produtos?estoque=esgotado',
      tom: 'perigo',
    })
  }

  if (catalogo.ok) {
    /*
     * Abaixo do minimo MENOS os esgotados: o esgotado ja tem linha propria
     * acima, e as duas contagens do resumo se sobrepoem de proposito. Somar as
     * duas faria o lojista contar o mesmo produto duas vezes ao repor.
     */
    const repor = catalogo.dados.belowMinimum - catalogo.dados.outOfStock
    if (repor > 0) {
      avisos.push({
        texto: `${repor} ${plural(repor, 'produto para repor', 'produtos para repor')}`,
        href: '/app/produtos?estoque=baixo',
        tom: 'atencao',
      })
    }
  }

  if (contas.ok && contas.dados.temVencidas) {
    const vencidas = contas.dados.grupos.find((g) => g.faixa === 'overdue')?.itens.length ?? 0
    avisos.push({
      texto: `${vencidas} ${plural(vencidas, 'conta vencida', 'contas vencidas')}`,
      href: '/app/financeiro/contas-a-pagar',
      tom: 'perigo',
    })
  }

  return avisos
}
