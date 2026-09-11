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
 *  | confirmarImportacao   | POST /produtos/importar        | importar planilha |
 *  | importarXmlCompra     | POST /compras/xml              | importar XML      |
 *
 * O XML da nota de compra e lido no navegador so para MOSTRAR os itens
 * antes de confirmar. Quem grava entrada de estoque e custo e o servidor:
 * ele precisa validar a chave de acesso, evitar lancar a mesma nota duas
 * vezes e registrar quem importou.
 */

import { pedir } from './http'
import { produtos } from './mock-data'
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

/** SUBSTITUIR POR: GET /catalogo/ean/:ean */
export async function buscarEan(ean: string): Promise<EanResult> {
  await delay(850)

  const limpo = ean.replace(/\D/g, '')
  if (limpo.length < 8) {
    return { ok: false, error: 'Código de barras incompleto.' }
  }

  /* Primeiro procura no proprio catalogo — se o produto ja existe, o mais
     util e avisar, nao criar um duplicado. */
  const jaCadastrado = produtos.find((p) => p.ean === limpo)
  if (jaCadastrado) {
    return {
      ok: false,
      error: `Este codigo ja esta no produto "${jaCadastrado.descricao}".`,
    }
  }

  const base: Record<string, DadosEan> = {
    '7891000100103': {
      descricao: 'Leite condensado 395g',
      ncm: '0402.99.00',
      categoria: 'Mercearia',
    },
    '7894900011517': {
      descricao: 'Refrigerante cola 2L',
      ncm: '2202.10.00',
      categoria: 'Bebidas',
    },
  }

  const dados = base[limpo]
  if (!dados) {
    return {
      ok: false,
      error: 'Código não encontrado na base. Preencha os dados manualmente.',
    }
  }

  return { ok: true, dados }
}

/* -------------------------------------------------------------------------- */
/* Busca assistida de NCM                                                     */
/* -------------------------------------------------------------------------- */

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
  /* Natureza da operacao — 5102 revenda comum, 5405 com ST ja recolhida. */
  cfop: string
  /* CST (2 digitos) ou CSOSN (3), conforme o regime da empresa. */
  situacaoTributaria: string
  categoria: string
  fornecedor: string
  precoCusto: number
  precoVenda: number
  estoque: number
  estoqueMinimo: number
  imagem: string | null
}

/**
 * Cadastra o produto — RF-017, RF-019.
 *
 * **Imagem nao e enviada** — precisa de upload de arquivo, que esta fora do
 * escopo aqui. Categoria e fornecedor vao como texto (`category`/`supplier`):
 * nenhum dos dois normaliza numa tabela propria, e a coluna do fornecedor foi
 * adicionada ao lado da de categoria (migration 0007).
 *
 * O fornecedor era digitado nesta tela e DESCARTADO em silencio: a coluna ja
 * existia no banco, mas o contrato de cadastro nunca a expunha, e o lojista
 * achava ter informado.
 */
export async function salvarProduto(
  dados: DadosProduto,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let resposta: Response
  try {
    resposta = await fetch('/api/produtos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        description: dados.descricao,
        ...(dados.ean ? { barcode: dados.ean } : {}),
        unitOfMeasure: 'un',
        /* A tela trabalha em reais; o contrato exige centavos inteiros
           (RNF-044). A conversao acontece AQUI, na borda, e nao no meio. */
        salePriceCents: Math.round(dados.precoVenda * 100),
        costPriceCents: Math.round(dados.precoCusto * 100),
        minStock: Math.round(dados.estoqueMinimo),
        ...(dados.categoria.trim() === '' ? {} : { category: dados.categoria.trim() }),
        ...(dados.fornecedor.trim() === '' ? {} : { supplier: dados.fornecedor.trim() }),

        /*
         * Fiscais — RF-046.
         *
         * O NCM ja era digitado nesta tela e NAO era enviado: o lojista
         * preenchia e o sistema descartava em silencio, e a nota nao sairia por
         * falta de um dado que ele achava ter informado. Os tres vao juntos
         * agora, e so quando preenchidos — o cadastro continua rapido, e quem
         * cobra a falta e a emissao, que sabe dizer qual produto travou.
         */
        ...(dados.ncm.trim() === '' ? {} : { ncm: dados.ncm.trim() }),
        ...(dados.cfop.trim() === '' ? {} : { cfop: dados.cfop.trim() }),
        ...(dados.situacaoTributaria.trim() === ''
          ? {}
          : { taxSituationCode: dados.situacaoTributaria.trim() }),
      }),
    })
  } catch {
    return { ok: false, error: 'Sem conexao. Verifique sua internet.' }
  }

  const corpo = (await resposta.json().catch(() => ({}))) as {
    id?: string
    error?: { message?: string }
  }

  if (!resposta.ok) {
    return { ok: false, error: corpo.error?.message ?? 'Nao foi possivel salvar. Tente de novo.' }
  }

  return { ok: true, id: corpo.id! }
}

/** O que o servidor recusou, linha a linha. */
export type LinhaRecusada = {
  /** Posicao na lista enviada, base zero. */
  index: number
  description: string
  reason: string
}

export type ResultadoDaImportacao = {
  importados: number
  recusadas: LinhaRecusada[]
}

/**
 * Converte um numero digitado em planilha para centavos.
 *
 * Aceita "12,90", "12.90", "R$ 12,90" e "1.234,56" — sao todos formatos que
 * saem de planilha em pt-BR. Devolve `null` quando nao da para ler, e nao zero:
 * zero passaria como preco valido e o produto entraria custando nada.
 */
export function centavosDaPlanilha(texto: string | undefined): number | null {
  const bruto = (texto ?? '').replace(/[^d,.-]/g, '').trim()
  if (bruto === '') return null

  /*
   * A ULTIMA virgula ou ponto e o separador decimal; o resto e milhar. E o que
   * distingue "1.234,56" de "1.234" — no primeiro o ponto separa milhar, no
   * segundo tambem, e ler o ponto como decimal transformaria mil reais em um.
   */
  const ultimoSeparador = Math.max(bruto.lastIndexOf(','), bruto.lastIndexOf('.'))
  const temDecimal = ultimoSeparador >= 0 && bruto.length - ultimoSeparador - 1 <= 2

  const inteiro = temDecimal ? bruto.slice(0, ultimoSeparador) : bruto
  const decimal = temDecimal ? bruto.slice(ultimoSeparador + 1) : ''

  const numero = Number(`${inteiro.replace(/[.,]/g, '')}.${decimal.padEnd(2, '0') || '00'}`)

  return Number.isFinite(numero) ? Math.round(numero * 100) : null
}

/** Quantidade inteira de planilha. `null` quando nao da para ler. */
export function inteiroDaPlanilha(texto: string | undefined): number | null {
  const bruto = (texto ?? '').replace(/[^d-]/g, '').trim()
  if (bruto === '') return null
  const n = Number(bruto)
  return Number.isInteger(n) ? n : null
}

/**
 * Importa o catalogo de verdade — NR-072, US-008.
 *
 * Ate agora esta funcao era `await delay(1200)`: a tela dizia "150 importados"
 * e nao gravava nada. Agora ela manda o lote para `POST /produtos/importacao` e
 * devolve o que o SERVIDOR aceitou — que e diferente do que o navegador achou
 * que era valido, e a diferenca e justamente o que o lojista precisa ver.
 *
 * Preco ilegivel vira recusa AQUI, com a linha identificada, em vez de virar
 * zero e passar. Um produto que entra custando nada e pior que um que nao
 * entra: o primeiro so aparece no dia em que alguem vende no prejuizo.
 */
export async function confirmarImportacaoProdutos(
  registros: Record<string, string>[],
): Promise<ResultadoDaImportacao> {
  const recusadas: LinhaRecusada[] = []
  const enviar: Record<string, unknown>[] = []
  /* Mapeia a posicao no lote enviado de volta para a posicao original, para o
     indice que o servidor devolver apontar para a linha certa da planilha. */
  const origem: number[] = []

  registros.forEach((r, index) => {
    const venda = centavosDaPlanilha(r.precoVenda)
    const custo = centavosDaPlanilha(r.precoCusto) ?? 0
    const descricao = (r.descricao ?? '').trim()

    if (descricao === '') {
      recusadas.push({ index, description: descricao, reason: 'Descricao vazia.' })
      return
    }
    if (venda === null) {
      recusadas.push({ index, description: descricao, reason: 'Preco de venda ilegivel.' })
      return
    }

    origem.push(index)
    enviar.push({
      description: descricao,
      unitOfMeasure: 'un',
      salePriceCents: venda,
      costPriceCents: custo,
      ...(r.ean?.trim() ? { barcode: r.ean.trim() } : {}),
      ...(r.ncm?.trim() ? { ncm: r.ncm.trim() } : {}),
      ...(inteiroDaPlanilha(r.estoque) !== null ? { stock: inteiroDaPlanilha(r.estoque) } : {}),
    })
  })

  if (enviar.length === 0) return { importados: 0, recusadas }

  const r = await pedir<{ imported: number; rejected: LinhaRecusada[] }>(
    '/api/produtos/importacao',
    { method: 'POST', body: JSON.stringify({ products: enviar }) },
  )

  if (!r.ok) {
    /* O lote inteiro caiu. Dizer "0 importados" com o motivo e melhor que
       lancar: a tela ja tem onde mostrar o relatorio, e a pessoa precisa saber
       que nada entrou. */
    return {
      importados: 0,
      recusadas: [
        ...recusadas,
        ...enviar.map((_, i) => ({
          index: origem[i]!,
          description: String(enviar[i]!.description),
          reason: r.erro,
        })),
      ],
    }
  }

  return {
    importados: r.dados.imported,
    recusadas: [
      ...recusadas,
      ...r.dados.rejected.map((rec) => ({ ...rec, index: origem[rec.index] ?? rec.index })),
    ],
  }
}

/* --------------------------------------------------------------------------
 * Estoque
 * --------------------------------------------------------------------------
 *
 * SAIU DAQUI. O saldo, a trilha e o ajuste vivem em `catalogo-api.ts`, contra
 * as rotas de verdade (`GET/POST /produtos/:id/estoque` e
 * `GET /produtos/:id/movimentos`).
 *
 * O que estava aqui era pior do que um mock parado: `ajustarEstoque` era um
 * `delay(700)` seguido de `return { ok: true }`, e a tela respondia "Ajuste
 * registrado no historico". O lojista corrigia a contagem, via a confirmacao,
 * e o saldo continuava errado — ele acreditava por causa da mensagem.
 * --------------------------------------------------------------------------
 */

/* -------------------------------------------------------------------------- */
/* XML de nota de compra                                                      */
/* -------------------------------------------------------------------------- */

export type ItemXml = {
  codigoFornecedor: string
  descricao: string
  ean: string
  ncm: string
  quantidade: number
  valorUnitario: number
  /** Produto ja cadastrado que combina com o item, quando houver. */
  produtoVinculado: Produto | null
}

export type NotaXml = {
  numero: string
  emitente: string
  emissao: string
  itens: ItemXml[]
}

/**
 * Le uma NF-e a partir do XML, no proprio navegador.
 *
 * Usa DOMParser (nativo) em vez de biblioteca: o que precisamos e um
 * punhado de campos por item, e a leitura aqui e apenas para montar a
 * previa. A gravacao continua sendo do servidor.
 */
export function lerXmlNfe(
  texto: string,
): { ok: true; nota: NotaXml } | { ok: false; error: string } {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(texto, 'application/xml')
  } catch {
    return { ok: false, error: 'Não foi possível ler o XML.' }
  }

  if (doc.querySelector('parsererror')) {
    return { ok: false, error: 'O arquivo não é um XML válido.' }
  }

  const texto1 = (el: Element | null | undefined, tag: string): string =>
    el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''

  const infNFe = doc.getElementsByTagName('infNFe')[0]
  if (!infNFe) {
    return { ok: false, error: 'Este XML não parece ser de uma NF-e.' }
  }

  const ide = infNFe.getElementsByTagName('ide')[0]
  const emit = infNFe.getElementsByTagName('emit')[0]

  const dets = Array.from(infNFe.getElementsByTagName('det'))
  if (dets.length === 0) {
    return { ok: false, error: 'A nota não tem itens.' }
  }

  const itens: ItemXml[] = dets.map((det) => {
    const prod = det.getElementsByTagName('prod')[0]
    const ean = texto1(prod, 'cEAN')
    const eanLimpo = ean && ean !== 'SEM GTIN' ? ean : ''
    const codigo = texto1(prod, 'cProd')

    /* Casa com o catalogo por EAN e, se nao achar, pelo codigo. */
    const vinculado =
      produtos.find((p) => eanLimpo && p.ean === eanLimpo) ??
      produtos.find((p) => p.codigo === codigo) ??
      null

    return {
      codigoFornecedor: codigo,
      descricao: texto1(prod, 'xProd'),
      ean: eanLimpo,
      ncm: texto1(prod, 'NCM'),
      quantidade: Number(texto1(prod, 'qCom')) || 0,
      valorUnitario: Number(texto1(prod, 'vUnCom')) || 0,
      produtoVinculado: vinculado,
    }
  })

  return {
    ok: true,
    nota: {
      numero: texto1(ide, 'nNF'),
      emitente: texto1(emit, 'xNome'),
      emissao: (texto1(ide, 'dhEmi') || texto1(ide, 'dEmi')).slice(0, 10),
      itens,
    },
  }
}

/** SUBSTITUIR POR: POST /compras/xml — grava entrada de estoque e custo. */
export async function importarXmlCompra(
  nota: NotaXml,
  decisoes: Record<string, 'vincular' | 'criar' | 'ignorar'>,
): Promise<{ ok: true; entradas: number } | { ok: false; error: string }> {
  await delay(1300)
  void nota
  const entradas = Object.values(decisoes).filter((d) => d !== 'ignorar').length
  return { ok: true, entradas }
}

/* -------------------------------------------------------------------------- */
/* Utilitarios de tela                                                        */
/* -------------------------------------------------------------------------- */

export type NivelEstoque = 'normal' | 'baixo' | 'esgotado'

/**
 * Aceita QUALQUER coisa com saldo e minimo, e nao so `Produto`.
 *
 * O produto que vem da api nao tem `categoria` nem `fornecedor`, entao nao e
 * um `Produto` — e a regra "zerado e esgotado, abaixo do minimo e baixo" e a
 * mesma para os dois. Duplica-la faria a lista e o detalhe do produto
 * discordarem sobre a mesma etiqueta.
 */
export function nivelEstoque(produto: {
  readonly estoque: number
  readonly estoqueMinimo: number
}): NivelEstoque {
  if (produto.estoque <= 0) return 'esgotado'
  if (produto.estoque < produto.estoqueMinimo) return 'baixo'
  return 'normal'
}

/** Margem sobre o preco de venda, em porcentagem. */
export function calcularMargem(custo: number, venda: number): number | null {
  if (!venda || venda <= 0) return null
  return ((venda - custo) / venda) * 100
}
