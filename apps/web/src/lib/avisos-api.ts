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
 * - resposta nova em chamado de suporte, de `GET /suporte/chamados`.
 *
 * - cliente sem comprar ha muito tempo, de `GET /clientes?filter=inativos`.
 *   O "muito tempo" NAO e definido aqui: `filter=inativos` ja aplica
 *   `DIAS_PARA_INATIVO` (o mesmo limite que a tela de Clientes usa), entao os
 *   dois lugares nunca podem discordar sobre quem esta inativo.
 *
 * - pedido de conexao recebido, de `GET /conexoes/pendentes` — ADR-0008.
 *
 * Cada regra e codigo comum, sem IA — o texto ja sai pronto do dado, entao nao
 * ha o que um modelo de linguagem precisaria decidir aqui.
 *
 * O suporte entrou agora que ele tem banco (NR-080). Antes o numero vinha de
 * `lib/mock-data`, e alimentar o sino com ele seria trocar um ponto sempre
 * aceso por um ponto que mente com mais conviccao.
 */

export type Aviso = {
  /** Curto: o sino e estreito. */
  readonly texto: string
  readonly href: string
  readonly tom: 'atencao' | 'perigo'
  /**
   * Quantos itens o aviso representa.
   *
   * Existe para o badge da navegacao mostrar o NUMERO e nao a quantidade de
   * avisos. Sem ele, "3 respostas do suporte" viraria um badge "1" — e o
   * lojista veria numeros diferentes na navegacao e no sino, que e o defeito
   * que ter uma fonte so deveria evitar.
   */
  readonly contagem: number
}

type ResumoDoCatalogo = {
  belowMinimum: number
  outOfStock: number
}

type ContasAgrupadas = {
  temVencidas: boolean
  grupos: { faixa: string; payables: unknown[] }[]
}

type ChamadosDaApi = { unread: number }
type ClientesInativos = { total: number }
type ConexoesPendentes = { count: number }

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos)

/**
 * Busca os sinais em paralelo e ignora quem falhar.
 *
 * Um aviso que nao carregou nao pode derrubar os outros nem a barra do topo: o
 * sino e acessorio da tela, e uma falha nele nao deve impedir o lojista de
 * vender. Quem falhou simplesmente nao aparece.
 */
export async function carregarAvisos(): Promise<Aviso[]> {
  const [catalogo, contas, chamados, inativos, conexoes] = await Promise.all([
    pedir<ResumoDoCatalogo>('/api/produtos/resumo'),
    pedir<ContasAgrupadas>('/api/contas-a-pagar'),
    pedir<ChamadosDaApi>('/api/suporte/chamados'),
    pedir<ClientesInativos>('/api/clientes?filter=inativos&pageSize=1'),
    pedir<ConexoesPendentes>('/api/conexoes/pendentes'),
  ])

  const avisos: Aviso[] = []

  if (catalogo.ok && catalogo.dados.outOfStock > 0) {
    const n = catalogo.dados.outOfStock
    avisos.push({
      texto: `${n} ${plural(n, 'produto esgotado', 'produtos esgotados')}`,
      href: '/app/produtos?estoque=esgotado',
      tom: 'perigo',
      contagem: n,
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
        contagem: repor,
      })
    }
  }

  if (chamados.ok && chamados.dados.unread > 0) {
    const n = chamados.dados.unread
    avisos.push({
      texto: `${n} ${plural(n, 'resposta do suporte', 'respostas do suporte')}`,
      href: '/app/suporte',
      tom: 'atencao',
      contagem: n,
    })
  }

  if (inativos.ok && inativos.dados.total > 0) {
    const n = inativos.dados.total
    avisos.push({
      texto: `${n} ${plural(n, 'cliente sem comprar há muito tempo', 'clientes sem comprar há muito tempo')}`,
      href: '/app/clientes?filtro=inativos',
      tom: 'atencao',
      contagem: n,
    })
  }

  if (conexoes.ok && conexoes.dados.count > 0) {
    const n = conexoes.dados.count
    avisos.push({
      texto: `${n} ${plural(n, 'pedido de conexão', 'pedidos de conexão')}`,
      href: '/app/conexoes',
      tom: 'atencao',
      contagem: n,
    })
  }

  if (contas.ok && contas.dados.temVencidas) {
    const vencidas = contas.dados.grupos.find((g) => g.faixa === 'overdue')?.payables.length ?? 0
    avisos.push({
      texto: `${vencidas} ${plural(vencidas, 'conta vencida', 'contas vencidas')}`,
      href: '/app/financeiro/contas-a-pagar',
      tom: 'perigo',
      contagem: vencidas,
    })
  }

  return avisos
}
