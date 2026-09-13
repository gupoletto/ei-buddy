import { chamarApi } from './api'
/**
 * ============================================================================
 * PONTOS DE INTEGRACAO — MODULO DE PRODUTOS
 * ============================================================================
 *
 *  | Funcao                | Endpoint esperado                       | Disparo           |
 *  |-----------------------|------------------------------------------|-------------------|
 *  | buscarEan             | GET  /produtos/codigo-de-barras/:codigo | busca por EAN     |
 *  | salvarProduto         | POST/PUT /produtos[/:id]                | submit do form    |
 *  | ajustarEstoque        | POST /produtos/:id/ajustes              | ajuste manual     |
 *  | movimentacoesEstoque  | GET  /produtos/:id/movimentos           | historico         |
 *  | confirmarImportacao   | POST /produtos/importar                 | importar planilha |
 *
 * Busca assistida de NCM e importacao de XML de nota de compra NAO existem
 * aqui: nenhuma das duas tem requisito por tras (ver `produtos-api.ts` do
 * web), e a segunda nem faria sentido no mobile — quem esta no balcao com o
 * celular na mao esta vendendo, nao dando entrada em mercadoria.
 */

import type { Produto } from './types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
    return { situacao: 'erro', mensagem: 'Código de barras incompleto. Tente ler de novo.' }
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
 * **Fornecedor e imagem nao sao enviados.** Categoria vai como texto
 * (`category`) — o 0909 nao tem tabela `categories`. O contrato e `.strict()`.
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
      ...(dados.categoria.trim() === '' ? {} : { category: dados.categoria.trim() }),
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
        origem: 'NF-e 4471 · Torrefação Aurora',
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
