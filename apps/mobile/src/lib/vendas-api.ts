/**
 * ============================================================================
 * PONTOS DE INTEGRACAO — VENDAS / PDV
 * ============================================================================
 *
 *  | Funcao              | Endpoint esperado              | Disparo          |
 *  |---------------------|--------------------------------|------------------|
 *  | criarVenda          | POST /vendas                   | fim do carrinho  |
 *  | criarCobrancaVenda  | POST /vendas/:id/cobrancas     | etapa pagamento  |
 *  | statusCobrancaVenda | GET  /vendas/:id/cobrancas/:cid| polling          |
 *  | confirmarDinheiro   | POST /vendas/:id/pagamentos    | recebimento manual|
 *  | emitirNota          | POST /vendas/:id/notas         | etapa fiscal     |
 *  | listarVendas        | GET  /vendas?de=&ate=          | historico        |
 *  | estornarVenda       | POST /vendas/:id/estorno       | estorno          |
 *
 * O SERVIDOR E QUEM FECHA A VENDA. O carrinho vive no navegador so ate o
 * fechamento; a partir dai, preco, imposto, taxa e estoque sao calculados
 * e gravados no servidor. Confiar no total que o front mandou permitiria
 * alterar preco pelo devtools.
 *
 * ESTORNO precisa ser transacional e cobrir tres coisas de uma vez:
 * devolver o item ao estoque, estornar o titulo em Contas a Receber e
 * cancelar a nota fiscal (ou emitir a de devolucao). Se uma falhar, nenhuma
 * pode valer — venda estornada com estoque nao devolvido vira furo de
 * inventario que ninguem consegue explicar depois.
 */

import { produtos } from './mock-data'
/* Tipos da cobranca Pix. No web eles moravam no auth-api por causa da
   assinatura; aqui, como o mobile nao cobra mensalidade, o unico uso e a
   venda — entao vivem junto dela. */
export type PixCharge = {
  chargeId: string
  /** Payload "copia e cola" — vira o QR Code. */
  payload: string
  /** Timestamp (ms) em que o codigo expira. */
  expiresAt: number
  amount: number
}

export type PixChargeStatus = 'pending' | 'paid' | 'expired'
import { chamarApi } from './api'
import type { FormaPagamento, Produto } from './types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Data de referencia do app. */
export const HOJE = '2026-08-24'

/* -------------------------------------------------------------------------- */
/* Carrinho                                                                   */
/* -------------------------------------------------------------------------- */

export type ItemCarrinho = {
  produtoId: string
  codigo: string
  descricao: string
  precoUnitario: number
  precoCusto: number
  quantidade: number
  estoqueDisponivel: number
}

export type TipoDesconto = 'percentual' | 'valor'

export type Desconto = {
  tipo: TipoDesconto
  /** Percentual (0-100) ou valor em reais, conforme o tipo. */
  quantia: number
}

export function subtotalItem(item: ItemCarrinho): number {
  return item.precoUnitario * item.quantidade
}

export function subtotalCarrinho(itens: ItemCarrinho[]): number {
  return itens.reduce((acc, i) => acc + subtotalItem(i), 0)
}

export function valorDesconto(subtotal: number, desconto: Desconto | null): number {
  if (!desconto || desconto.quantia <= 0) return 0

  const bruto =
    desconto.tipo === 'percentual' ? (subtotal * desconto.quantia) / 100 : desconto.quantia

  /* Nunca deixa o desconto passar do subtotal — total negativo nao existe. */
  return Math.min(bruto, subtotal)
}

export function totalCarrinho(itens: ItemCarrinho[], desconto: Desconto | null): number {
  const sub = subtotalCarrinho(itens)
  return sub - valorDesconto(sub, desconto)
}

export function paraItemCarrinho(produto: Produto): ItemCarrinho {
  return {
    produtoId: produto.id,
    codigo: produto.codigo,
    descricao: produto.descricao,
    precoUnitario: produto.precoVenda,
    precoCusto: produto.precoCusto,
    quantidade: 1,
    estoqueDisponivel: produto.estoque,
  }
}

/** Busca produto pelo EAN lido na camera. */
export function produtoPorEan(ean: string): Produto | null {
  const limpo = ean.replace(/\D/g, '')
  return (
    produtos.find((p) => p.ean === limpo) ??
    produtos.find((p) => p.codigo.toUpperCase() === ean.trim().toUpperCase()) ??
    null
  )
}

/* -------------------------------------------------------------------------- */
/* Pagamento                                                                  */
/* -------------------------------------------------------------------------- */

export const FORMAS: {
  valor: FormaPagamento
  rotulo: string
  /** Taxa da operadora, em % — descontada do valor liquido. */
  taxa: number
  /** Precisa de link/QR para o cliente pagar. */
  online: boolean
}[] = [
  { valor: 'dinheiro', rotulo: 'Dinheiro', taxa: 0, online: false },
  { valor: 'pix', rotulo: 'Pix', taxa: 0.99, online: true },
  { valor: 'debito', rotulo: 'Débito', taxa: 1.99, online: true },
  { valor: 'credito', rotulo: 'Crédito', taxa: 3.49, online: true },
  { valor: 'carteira', rotulo: 'Carteira', taxa: 0, online: false },
]

export type Pagamento = {
  id: string
  forma: FormaPagamento
  valor: number
  status: 'pendente' | 'confirmado' | 'falhou'
}

/** Taxa cobrada pela operadora sobre um pagamento. */
export function taxaDoPagamento(pagamento: Pagamento): number {
  const forma = FORMAS.find((f) => f.valor === pagamento.forma)
  if (!forma) return 0
  return (pagamento.valor * forma.taxa) / 100
}

/**
 * Valor que efetivamente entra em Contas a Receber: o pago menos a taxa
 * da operadora. E este numero que precisa bater com o extrato — nao o
 * valor de venda.
 */
export function valorLiquido(pagamentos: Pagamento[]): number {
  return pagamentos
    .filter((p) => p.status === 'confirmado')
    .reduce((acc, p) => acc + p.valor - taxaDoPagamento(p), 0)
}

/** SUBSTITUIR POR: POST /vendas/:id/cobrancas */
export async function criarCobrancaVenda(valor: number): Promise<PixCharge> {
  await delay(800)

  const chargeId = `vch-${Math.random().toString(36).slice(2, 10)}`
  const payload = [
    '00020126580014BR.GOV.BCB.PIX0136',
    chargeId.padEnd(36, '0'),
    '52040000530398654',
    valor.toFixed(2).padStart(6, '0'),
    '5802BR5913EI BUDDY LTDA6008CURITIBA62070503***6304',
  ].join('')

  return {
    chargeId,
    payload,
    expiresAt: Date.now() + 15 * 60_000,
    amount: valor,
  }
}

/** SUBSTITUIR POR: GET /vendas/:id/cobrancas/:cid */
export async function statusCobrancaVenda(chargeId: string): Promise<PixChargeStatus> {
  await delay(400)
  void chargeId
  return 'pending'
}

/* -------------------------------------------------------------------------- */
/* Fechamento da venda                                                        */
/* -------------------------------------------------------------------------- */

export type DadosVenda = {
  clienteId: string | null
  clienteNome: string
  itens: ItemCarrinho[]
  desconto: Desconto | null
  pagamentos: Pagamento[]
}

/** SUBSTITUIR POR: POST /vendas */
export async function criarVenda(
  dados: DadosVenda,
): Promise<{ ok: true; id: string; numero: string } | { ok: false; error: string }> {
  await delay(900)

  if (dados.itens.length === 0) {
    return { ok: false, error: 'O carrinho está vazio.' }
  }

  const numero = String(1843 + Math.floor(Math.random() * 50))
  return { ok: true, id: `ven-${Date.now()}`, numero }
}

/* -------------------------------------------------------------------------- */
/* Documentos fiscais                                                         */
/* -------------------------------------------------------------------------- */

export type TipoNotaFiscal = 'nfce' | 'nfse'
export type EstadoEmissao = 'ocioso' | 'processando' | 'emitida' | 'erro'

export type NotaEmitida = {
  tipo: TipoNotaFiscal
  numero: string
  chave: string
  /** Link do DANFE/PDF devolvido pelo provedor. */
  url: string
  /** Impostos apurados, guardados para relatorio. */
  impostos: { nome: string; valor: number }[]
}

/**
 * Certificado digital da empresa.
 *
 * SUBSTITUIR POR: GET /empresa/certificado — a emissao depende de um
 * certificado A1 valido, cadastrado na tela de Empresa.
 */
export type SituacaoCertificado = 'ausente' | 'valido' | 'expirado'

export async function situacaoCertificado(): Promise<SituacaoCertificado> {
  await delay(300)
  /* Sem backend, nenhum certificado foi enviado — a tela leva o usuario
     para o cadastro em vez de deixar tentar emitir e falhar. */
  return 'ausente'
}

/** SUBSTITUIR POR: POST /vendas/:id/notas */
export async function emitirNota(
  vendaId: string,
  tipo: TipoNotaFiscal,
  total: number,
): Promise<{ ok: true; nota: NotaEmitida } | { ok: false; error: string }> {
  await delay(1800)
  void vendaId

  const numero = String(4200 + Math.floor(Math.random() * 100))

  return {
    ok: true,
    nota: {
      tipo,
      numero,
      chave: `4126 0812 3456 7800 0190 5500 1000 0${numero} 1234 5678 90`,
      url: '#',
      impostos:
        tipo === 'nfce'
          ? [
              { nome: 'ICMS', valor: total * 0.18 },
              { nome: 'PIS', valor: total * 0.0165 },
              { nome: 'COFINS', valor: total * 0.076 },
            ]
          : [
              { nome: 'ISS', valor: total * 0.05 },
              { nome: 'PIS', valor: total * 0.0065 },
              { nome: 'COFINS', valor: total * 0.03 },
            ],
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Historico                                                                  */
/* -------------------------------------------------------------------------- */

export type VendaHistorico = {
  id: string
  numero: string
  data: string
  clienteNome: string
  itens: { descricao: string; quantidade: number; precoUnitario: number }[]
  subtotal: number
  desconto: number
  total: number
  pagamentos: { forma: FormaPagamento; valor: number }[]
  valorLiquido: number
  imposto: number
  nota: { tipo: TipoNotaFiscal; numero: string } | null
  status: 'concluida' | 'estornada'
}

/** SUBSTITUIR POR: GET /vendas */
export function listarVendas(): VendaHistorico[] {
  return [
    {
      id: 'ven-1',
      numero: '1842',
      data: '2026-08-24T14:32:00',
      clienteNome: 'Joana Ribeiro',
      itens: [
        { descricao: 'Cafe torrado e moido 500g', quantidade: 2, precoUnitario: 21.9 },
        { descricao: 'Filtro de papel n103', quantidade: 1, precoUnitario: 8.9 },
        { descricao: 'Acucar mascavo 1kg', quantidade: 3, precoUnitario: 12.9 },
      ],
      subtotal: 91.4,
      desconto: 4.5,
      total: 86.9,
      pagamentos: [{ forma: 'pix', valor: 86.9 }],
      valorLiquido: 86.04,
      imposto: 3.12,
      nota: { tipo: 'nfce', numero: '4187' },
      status: 'concluida',
    },
    {
      id: 'ven-2',
      numero: '1841',
      data: '2026-08-24T13:58:00',
      clienteNome: 'Venda sem cliente',
      itens: [{ descricao: 'Azeite extra virgem 500ml', quantidade: 1, precoUnitario: 39.9 }],
      subtotal: 39.9,
      desconto: 0,
      total: 39.9,
      pagamentos: [{ forma: 'credito', valor: 39.9 }],
      valorLiquido: 38.51,
      imposto: 1.44,
      nota: { tipo: 'nfce', numero: '4186' },
      status: 'concluida',
    },
    {
      id: 'ven-3',
      numero: '1840',
      data: '2026-08-24T11:20:00',
      clienteNome: 'Marcos Dias',
      itens: [
        { descricao: 'Leite integral 1L', quantidade: 12, precoUnitario: 5.99 },
        { descricao: 'Biscoito integral 200g', quantidade: 6, precoUnitario: 7.5 },
      ],
      subtotal: 116.88,
      desconto: 0,
      total: 116.88,
      pagamentos: [{ forma: 'dinheiro', valor: 116.88 }],
      valorLiquido: 116.88,
      imposto: 4.21,
      nota: { tipo: 'nfce', numero: '4185' },
      status: 'concluida',
    },
    {
      id: 'ven-4',
      numero: '1839',
      data: '2026-08-23T17:05:00',
      clienteNome: 'Padaria Sol LTDA',
      itens: [{ descricao: 'Cafe torrado e moido 500g', quantidade: 8, precoUnitario: 19.5 }],
      subtotal: 156.0,
      desconto: 0,
      total: 156.0,
      pagamentos: [{ forma: 'debito', valor: 156.0 }],
      valorLiquido: 152.9,
      imposto: 5.62,
      nota: { tipo: 'nfce', numero: '4181' },
      status: 'concluida',
    },
    {
      id: 'ven-5',
      numero: '1838',
      data: '2026-08-23T09:44:00',
      clienteNome: 'Restaurante Boa Mesa',
      itens: [{ descricao: 'Azeite extra virgem 500ml', quantidade: 2, precoUnitario: 39.2 }],
      subtotal: 78.4,
      desconto: 0,
      total: 78.4,
      pagamentos: [{ forma: 'carteira', valor: 78.4 }],
      valorLiquido: 0,
      imposto: 0,
      nota: null,
      status: 'estornada',
    },
  ]
}

/**
 * SUBSTITUIR POR: POST /vendas/:id/estorno
 *
 * Precisa ser transacional — ver nota no topo do arquivo.
 */
export async function estornarVenda(
  id: string,
): Promise<{ ok: true; itensDevolvidos: number } | { ok: false; error: string }> {
  await delay(1200)

  const venda = listarVendas().find((v) => v.id === id)
  if (!venda) return { ok: false, error: 'Venda não encontrada.' }
  if (venda.status === 'estornada') {
    return { ok: false, error: 'Esta venda já foi estornada.' }
  }

  const itensDevolvidos = venda.itens.reduce((acc, i) => acc + i.quantidade, 0)
  return { ok: true, itensDevolvidos }
}

/* -------------------------------------------------------------------------- */
/* Fechamento da venda contra a api — NR-071, RF-036, RNF-043                 */
/* -------------------------------------------------------------------------- */

/**
 * O metodo como o contrato o chama.
 *
 * A tela usa portugues (`dinheiro`, `carteira`); o contrato usa o vocabulario
 * do glossario (`cash`, `wallet`). A traducao acontece AQUI, na borda, e nao
 * espalhada — senao cada tela inventa a sua e uma delas erra.
 */
const METODO: Record<FormaPagamento, 'cash' | 'pix' | 'debit' | 'credit' | 'wallet'> = {
  dinheiro: 'cash',
  pix: 'pix',
  debito: 'debit',
  credito: 'credit',
  carteira: 'wallet',
}

/**
 * A venda como o servidor a gravou — US-020.
 *
 * Todos os valores vem da RESPOSTA, nenhum e recalculado aqui. O imposto usa a
 * aliquota da empresa e a tarifa usa a tabela do cadastro; refazer essa conta
 * no celular daria dois numeros para a mesma venda, e o que o lojista veria
 * dependeria de qual tela ele abriu.
 */
export type VendaRegistrada = {
  readonly id: string
  readonly numero: number
  readonly brutoCentavos: number
  readonly custoCentavos: number
  readonly impostoCentavos: number
  readonly tarifaCentavos: number
  readonly liquidoCentavos: number
  readonly trocoCentavos: number
  /** `true` quando o servidor devolveu uma venda que JA existia — RNF-043. */
  readonly reenvio: boolean
}

/**
 * Margem sobre o bruto, em pontos — RF-042.
 *
 * Liquido menos custo, sobre o bruto. `null` quando nao houve bruto: dividir
 * por zero daria `Infinity`, e "margem: Infinity%" e pior que "—".
 */
export function margemEmPontos(v: VendaRegistrada): number | null {
  if (v.brutoCentavos === 0) return null
  return Math.round(((v.liquidoCentavos - v.custoCentavos) / v.brutoCentavos) * 100 * 10) / 10
}

export type ResultadoFecharVenda =
  | { readonly ok: true; readonly venda: VendaRegistrada }
  | { readonly ok: false; readonly erro: string }

/**
 * Fecha a venda — RF-036, RNF-043.
 *
 * ## Sobre `chaveDeIdempotencia`
 *
 * Ela e PARAMETRO, e nao gerada aqui dentro, e essa e a decisao que faz a
 * idempotencia funcionar. Se fosse gerada a cada chamada, o reenvio depois de
 * uma falha de rede criaria uma SEGUNDA venda — com segundo estoque baixado e
 * segundo recebivel — e o cabecalho existiria sem proteger nada, que e pior que
 * nao te-lo, porque parece protegido.
 *
 * Quem chama gera a chave uma vez, quando o operador confirma, e reusa em toda
 * tentativa daquele fechamento.
 *
 * O total daqui NAO e enviado: o servidor recalcula preco, imposto e taxa a
 * partir do cadastro. O que a tela mostrou e referencia para o operador, nao
 * fonte da verdade — se divergir, quem esta certo e o servidor.
 */
export async function fecharVenda(
  itens: ItemCarrinho[],
  pagamentos: Pagamento[],
  chaveDeIdempotencia: string,
  opcoes: { clienteId?: string; descontoCentavos?: number } = {},
): Promise<ResultadoFecharVenda> {
  const r = await chamarApi<{
    sale: {
      id: string
      number: number
      grossAmountCents: number
      costAmountCents: number
      taxAmountCents: number
      cardFeeAmountCents: number
      netAmountCents: number
      changeCents: number
    }
    replayed: boolean
  }>('/sales', {
    method: 'POST',
    idempotencyKey: chaveDeIdempotencia,
    body: {
      ...(opcoes.clienteId === undefined ? {} : { customerId: opcoes.clienteId }),
      items: itens.map((i) => ({
        productId: i.produtoId,
        quantity: i.quantidade,
        /* Centavos inteiros na borda — RNF-044. */
        unitPriceCents: Math.round(i.precoUnitario * 100),
      })),
      payments: pagamentos.map((p) => ({
        method: METODO[p.forma],
        amountCents: Math.round(p.valor * 100),
      })),
      ...(opcoes.descontoCentavos === undefined ? {} : { discountCents: opcoes.descontoCentavos }),
    },
  })

  if (!r.ok) return { ok: false, erro: r.message }

  return {
    ok: true,
    venda: {
      id: r.dados.sale.id,
      numero: r.dados.sale.number,
      brutoCentavos: r.dados.sale.grossAmountCents,
      custoCentavos: r.dados.sale.costAmountCents,
      impostoCentavos: r.dados.sale.taxAmountCents,
      tarifaCentavos: r.dados.sale.cardFeeAmountCents,
      liquidoCentavos: r.dados.sale.netAmountCents,
      trocoCentavos: r.dados.sale.changeCents,
      reenvio: r.dados.replayed,
    },
  }
}

/**
 * O que ainda falta pagar — US-019.
 *
 * Devolve em centavos e pode ser NEGATIVO: pagaram a mais. So `dinheiro` vira
 * troco (RF-035); a mais no cartao ou no pix e erro de digitacao, e a tela
 * precisa distinguir os dois.
 */
export function faltaPagarCentavos(totalCentavos: number, pagamentos: Pagamento[]): number {
  const pago = pagamentos.reduce((soma, p) => soma + Math.round(p.valor * 100), 0)
  return totalCentavos - pago
}

/**
 * Uma chave por fechamento.
 *
 * `crypto.randomUUID` existe no Hermes do SDK 57. O prefixo nao e enfeite: no
 * log do servidor, uma chave que se identifica como vinda do PDV do celular
 * poupa a pergunta "de onde veio isto" quando alguem investigar um reenvio.
 */
export function novaChaveDeVenda(): string {
  return `pdv-${crypto.randomUUID()}`
}
