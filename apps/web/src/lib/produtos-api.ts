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
    return { ok: false, error: 'Codigo de barras incompleto.' }
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
      error: 'Codigo nao encontrado na base. Preencha os dados manualmente.',
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
 * **Fornecedor, categoria e imagem nao sao enviados**, pela mesma razao do
 * endereco do cliente: o contrato e `.strict()` e nao tem esses campos.
 * `categoria` existe como `categoryId` na api, mas a tela guarda o NOME e nao
 * o id, e inventar a correspondencia aqui seria adivinhar. Registrado no PR.
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
    return { ok: false, error: 'Nao foi possivel ler o XML.' }
  }

  if (doc.querySelector('parsererror')) {
    return { ok: false, error: 'O arquivo nao e um XML valido.' }
  }

  const texto1 = (el: Element | null | undefined, tag: string): string =>
    el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''

  const infNFe = doc.getElementsByTagName('infNFe')[0]
  if (!infNFe) {
    return { ok: false, error: 'Este XML nao parece ser de uma NF-e.' }
  }

  const ide = infNFe.getElementsByTagName('ide')[0]
  const emit = infNFe.getElementsByTagName('emit')[0]

  const dets = Array.from(infNFe.getElementsByTagName('det'))
  if (dets.length === 0) {
    return { ok: false, error: 'A nota nao tem itens.' }
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
