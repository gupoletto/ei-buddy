import { chamarApi } from './api'
/**
 * ============================================================================
 * PONTOS DE INTEGRACAO — MODULO DE PRODUTOS
 * ============================================================================
 *
 *  | Funcao                | Endpoint esperado              | Disparo           |
 *  |-----------------------|--------------------------------|-------------------|
 *  | buscarEan             | GET  /catalogo/ean/:ean        | busca por EAN     |
 *  | buscarNcm             | GET  /fiscal/ncm?q=            | busca assistida   |
 *  | salvarProduto         | POST/PUT /produtos[/:id]       | submit do form    |
 *  | ajustarEstoque        | POST /produtos/:id/ajustes     | ajuste manual     |
 *  | movimentacoesEstoque  | GET  /produtos/:id/movimentos  | historico         |
 *  | confirmarImportacao   | POST /produtos/importar        | importar planilha |
 *  | importarXmlCompra     | POST /compras/xml              | importar XML      |
 *
 * O XML da nota de compra e lido no navegador so para MOSTRAR os itens
 * antes de confirmar. Quem grava entrada de estoque e custo e o servidor:
 * ele precisa validar a chave de acesso, evitar lancar a mesma nota duas
 * vezes e registrar quem importou.
 */

import type { Produto } from './types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* -------------------------------------------------------------------------- */
/* Categorias e fornecedores                                                  */
/* -------------------------------------------------------------------------- */

/** SUBSTITUIR POR: GET /produtos/categorias */
export const CATEGORIAS_INICIAIS = [
  'Mercearia',
  'Laticinios',
  'Bebidas',
  'Utilidades',
  'Limpeza',
  'Higiene',
]

/** SUBSTITUIR POR: GET /fornecedores */
export const FORNECEDORES_INICIAIS = [
  'Torrefacao Aurora',
  'Engenho Doce',
  'Laticinios Campo Verde',
  'Alimentos Boa Safra',
  'Importadora Oliva',
  'Distribuidora Sul',
]

/* -------------------------------------------------------------------------- */
/* Consulta por EAN                                                           */
/* -------------------------------------------------------------------------- */

export type DadosEan = {
  descricao: string
  ncm: string
  categoria: string
}

export type EanResult = { ok: true; dados: DadosEan } | { ok: false; error: string }

/**
 * O que o leitor achou — RF-018.
 *
 * Tres desfechos, e a diferenca entre eles e o que a tela precisa saber:
 *
 * - `cadastrado`: o codigo JA e de um produto da loja. O mais util nao e
 *   cadastrar de novo, e abrir o que existe.
 * - `novo`: a loja nao tem esse codigo. Segue para o cadastro com o campo
 *   preenchido.
 * - `erro`: nao deu para perguntar.
 *
 * Antes isto devolvia `{ ok: false }` para "ja cadastrado", o que fazia a tela
 * mostrar mensagem de erro para o caso mais comum e mais util do balcao.
 */
export type LeituraDeCodigo =
  | { readonly situacao: 'cadastrado'; readonly produtoId: string; readonly descricao: string }
  | { readonly situacao: 'novo'; readonly ean: string }
  | { readonly situacao: 'erro'; readonly mensagem: string }

export async function buscarEan(ean: string): Promise<LeituraDeCodigo> {
  const limpo = ean.replace(/\D/g, '')

  /* Confere antes de ir a rede: EAN tem 8, 12, 13 ou 14 digitos, e leitura
     truncada e comum quando a etiqueta esta amassada. */
  if (![8, 12, 13, 14].includes(limpo.length)) {
    return { situacao: 'erro', mensagem: 'Codigo de barras incompleto. Tente ler de novo.' }
  }

  const r = await chamarApi<ProdutoDaApi>(`/produtos/codigo-de-barras/${limpo}`)

  if (r.ok) {
    return { situacao: 'cadastrado', produtoId: r.dados.id, descricao: r.dados.description }
  }

  /* 404 aqui e resposta, nao falha: o codigo lido e de produto que a loja ainda
     nao cadastrou, que e exatamente o caminho de cadastrar. */
  if (r.status === 404) return { situacao: 'novo', ean: limpo }

  return { situacao: 'erro', mensagem: r.message }
}

export type SugestaoNcm = { codigo: string; descricao: string }

/** SUBSTITUIR POR: GET /fiscal/ncm?q=<descricao> */
export async function buscarNcm(termo: string): Promise<SugestaoNcm[]> {
  await delay(500)

  const t = termo.trim().toLowerCase()
  if (t.length < 3) return []

  const tabela: SugestaoNcm[] = [
    { codigo: '0901.21.00', descricao: 'Cafe torrado, nao descafeinado' },
    { codigo: '0402.99.00', descricao: 'Leite condensado e outros leites' },
    { codigo: '0401.20.10', descricao: 'Leite UHT, teor de gordura ate 3%' },
    { codigo: '1701.13.00', descricao: 'Acucar de cana em bruto' },
    { codigo: '1905.31.00', descricao: 'Bolachas e biscoitos doces' },
    { codigo: '1509.10.00', descricao: 'Azeite de oliva virgem' },
    { codigo: '2202.10.00', descricao: 'Aguas com adicao de acucar, refrigerantes' },
    { codigo: '3401.11.00', descricao: 'Sabonetes de toucador' },
    { codigo: '4823.20.90', descricao: 'Papel-filtro em folhas ou tiras' },
  ]

  return tabela.filter((n) => n.descricao.toLowerCase().includes(t) || n.codigo.startsWith(t))
}

/* -------------------------------------------------------------------------- */
/* Gravacao                                                                   */
/* -------------------------------------------------------------------------- */

export type DadosProduto = {
  id?: string
  codigo: string
  descricao: string
  ean: string
  ncm: string
  categoria: string
  fornecedor: string
  precoCusto: number
  precoVenda: number
  estoque: number
  estoqueMinimo: number
  imagem: string | null
}

type ProdutoDaApi = { id: string; internalCode: string; description: string }

/**
 * Cadastra o produto — RF-017, RF-019.
 *
 * **Fornecedor, categoria, NCM e imagem nao sao enviados.** O contrato e
 * `.strict()` e nao tem esses campos, entao manda-los faria a requisicao
 * INTEIRA ser recusada. `categoria` existe como `categoryId` na api, mas a
 * tela guarda o NOME — inventar a correspondencia aqui seria adivinhar. Mesma
 * lacuna registrada no web (NR-072).
 */
export async function salvarProduto(
  dados: DadosProduto,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const r = await chamarApi<ProdutoDaApi>('/produtos', {
    method: 'POST',
    body: {
      description: dados.descricao,
      ...(dados.ean ? { barcode: dados.ean.replace(/\D/g, '') } : {}),
      unitOfMeasure: 'un',
      /* A tela trabalha em reais; o contrato exige centavos inteiros
         (RNF-044). A conversao acontece AQUI, na borda. */
      salePriceCents: Math.round(dados.precoVenda * 100),
      costPriceCents: Math.round(dados.precoCusto * 100),
      minStock: Math.round(dados.estoqueMinimo),
    },
  })

  return r.ok ? { ok: true, id: r.dados.id } : { ok: false, error: r.message }
}

/** SUBSTITUIR POR: POST /produtos/importar */
export async function confirmarImportacaoProdutos(
  registros: Record<string, string>[],
): Promise<void> {
  await delay(1200)
  void registros
}

/* -------------------------------------------------------------------------- */
/* Estoque                                                                    */
/* -------------------------------------------------------------------------- */

export type TipoMovimento = 'entrada' | 'saida' | 'ajuste'

export type MovimentoEstoque = {
  id: string
  data: string
  tipo: TipoMovimento
  quantidade: number
  /** Saldo depois do movimento. */
  saldo: number
  origem: string
  motivo?: string
}

/** SUBSTITUIR POR: GET /produtos/:id/movimentos?de=&ate= */
export function movimentacoesEstoque(produtoId: string): MovimentoEstoque[] {
  const base: Record<string, MovimentoEstoque[]> = {
    'prod-1': [
      {
        id: 'm1',
        data: '2026-08-24',
        tipo: 'saida',
        quantidade: 2,
        saldo: 4,
        origem: 'Venda 1842',
      },
      {
        id: 'm2',
        data: '2026-08-22',
        tipo: 'saida',
        quantidade: 6,
        saldo: 6,
        origem: 'Venda 1830',
      },
      {
        id: 'm3',
        data: '2026-08-18',
        tipo: 'ajuste',
        quantidade: -2,
        saldo: 12,
        origem: 'Ajuste manual',
        motivo: 'Avaria no transporte',
      },
      {
        id: 'm4',
        data: '2026-08-10',
        tipo: 'entrada',
        quantidade: 24,
        saldo: 14,
        origem: 'NF-e 4471 · Torrefacao Aurora',
      },
    ],
    'prod-2': [
      {
        id: 'm5',
        data: '2026-08-23',
        tipo: 'saida',
        quantidade: 3,
        saldo: 2,
        origem: 'Venda 1842',
      },
      {
        id: 'm6',
        data: '2026-08-05',
        tipo: 'entrada',
        quantidade: 12,
        saldo: 5,
        origem: 'NF-e 4465 · Engenho Doce',
      },
    ],
    'prod-3': [
      {
        id: 'm7',
        data: '2026-08-24',
        tipo: 'saida',
        quantidade: 12,
        saldo: 6,
        origem: 'Venda 1840',
      },
      {
        id: 'm8',
        data: '2026-08-15',
        tipo: 'entrada',
        quantidade: 36,
        saldo: 18,
        origem: 'NF-e 4468 · Campo Verde',
      },
    ],
  }
  return base[produtoId] ?? []
}

/** SUBSTITUIR POR: POST /produtos/:id/ajustes */
export async function ajustarEstoque(
  produtoId: string,
  novaQuantidade: number,
  motivo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await delay(700)
  void produtoId
  void novaQuantidade

  if (!motivo.trim()) {
    return { ok: false, error: 'Descreva o motivo do ajuste.' }
  }
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* XML de nota de compra — fica so no web                                     */
/* -------------------------------------------------------------------------- */

/*
 * A importacao de XML de nota de compra nao existe no mobile, por duas
 * razoes: o parser depende de DOMParser, que o React Native nao tem, e
 * conferir nota de fornecedor e tarefa de retaguarda. Quem esta no balcao
 * com o celular na mao esta vendendo, nao dando entrada em mercadoria.
 */

/* -------------------------------------------------------------------------- */
/* Utilitarios de tela                                                        */
/* -------------------------------------------------------------------------- */

export type NivelEstoque = 'normal' | 'baixo' | 'esgotado'

export function nivelEstoque(produto: Produto): NivelEstoque {
  if (produto.estoque <= 0) return 'esgotado'
  if (produto.estoque < produto.estoqueMinimo) return 'baixo'
  return 'normal'
}

/** Margem sobre o preco de venda, em porcentagem. */
export function calcularMargem(custo: number, venda: number): number | null {
  if (!venda || venda <= 0) return null
  return ((venda - custo) / venda) * 100
}
