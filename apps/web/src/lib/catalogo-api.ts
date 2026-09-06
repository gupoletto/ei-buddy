import { pedir, type Resultado } from './http'

/**
 * O catalogo do backoffice — NR-072, US-008.
 *
 * ## O que este modulo NAO tem, e por que
 *
 * O tipo `Produto` de `lib/types.ts` — o dos dados de exemplo — tem
 * `categoria`, `fornecedor` e `diasSemVenda`. Nenhum dos tres existe do outro
 * lado:
 *
 * - **fornecedor**: nao ha coluna nenhuma em `products`. O dado nunca foi
 *   cadastrado; ele so existia nos exemplos.
 * - **categoria**: a tabela `categories` existe e `products.category_id` aponta
 *   para ela, mas nenhuma rota devolve o NOME. Volta quando houver rota de
 *   categorias.
 * - **diasSemVenda**: sai das vendas, e nao do cadastro. Seria uma agregacao
 *   propria.
 *
 * Um filtro sobre campo que o servidor nao tem e um controle que mente: ele
 * some da tela junto com o dado. Preferir manter os tres com valor inventado
 * seria trocar dados falsos por rotulos falsos.
 */

export type ProdutoDoCatalogo = {
  id: string
  /** Codigo interno, gerado quando nao ha codigo de barras — RF-019. */
  codigo: string
  descricao: string
  ean: string | null
  ncm: string | null
  /** Em reais: a api fala em centavos, a tela fala em reais. */
  precoVenda: number
  precoCusto: number
  estoque: number
  estoqueMinimo: number
}

export type NivelDeEstoque = 'todos' | 'baixo' | 'esgotado'

export type PaginaDoCatalogo = {
  produtos: ProdutoDoCatalogo[]
  /** Quantos casam com o filtro — NAO quantos vieram nesta pagina. */
  total: number
  page: number
  pageSize: number
}

export type ResumoDoCatalogo = {
  total: number
  /** Abaixo do minimo. INCLUI os zerados — ver o comentario em `ResumoStats`. */
  belowMinimum: number
  outOfStock: number
  stockValueCents: number
}

type ProdutoDaApi = {
  id: string
  description: string
  barcode: string | null
  internalCode: string
  ncm: string | null
  salePriceCents: number
  costPriceCents: number
  stock: number
  minStock: number
}

const emReais = (centavos: number) => centavos / 100

const paraTela = (p: ProdutoDaApi): ProdutoDoCatalogo => ({
  id: p.id,
  codigo: p.internalCode,
  descricao: p.description,
  ean: p.barcode,
  ncm: p.ncm,
  precoVenda: emReais(p.salePriceCents),
  precoCusto: emReais(p.costPriceCents),
  estoque: p.stock,
  estoqueMinimo: p.minStock,
})

export type FiltroDoCatalogo = {
  termo: string
  estoque: NivelDeEstoque
  pagina: number
  porPagina: number
}

/**
 * Busca no SERVIDOR, e nao filtro sobre uma lista carregada.
 *
 * O catalogo de uma mercearia tem milhares de itens. Filtrar no navegador
 * exigiria traze-lo inteiro — e, pior, filtrar sobre a PAGINA daria respostas
 * erradas com cara de certas: "esgotados" mostraria os esgotados daqueles 24,
 * e nao os da loja.
 */
export async function carregarCatalogo(
  filtro: FiltroDoCatalogo,
): Promise<Resultado<PaginaDoCatalogo>> {
  const query = new URLSearchParams({
    stock: filtro.estoque,
    page: String(filtro.pagina),
    pageSize: String(filtro.porPagina),
  })

  /* Termo vazio nao viaja: e "me mostre o catalogo", nao "ache nada". */
  const termo = filtro.termo.trim()
  if (termo !== '') query.set('q', termo)

  const r = await pedir<{
    products: ProdutoDaApi[]
    total: number
    page: number
    pageSize: number
  }>(`/api/produtos/catalogo?${query.toString()}`)

  return r.ok
    ? {
        ok: true,
        dados: {
          produtos: r.dados.products.map(paraTela),
          total: r.dados.total,
          page: r.dados.page,
          pageSize: r.dados.pageSize,
        },
      }
    : r
}

/** Os numeros do topo, sobre o catalogo inteiro — nunca somados da pagina. */
export const carregarResumoDoCatalogo = (): Promise<Resultado<ResumoDoCatalogo>> =>
  pedir('/api/produtos/resumo')
