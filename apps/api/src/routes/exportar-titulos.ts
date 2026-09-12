import { Money } from '@na-regua/money'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * CSV e PDF de contas a pagar e a receber — tópico 4, botão "Exportar" que a
 * tela já tinha (`ContasView.tsx`), sempre respondendo com erro porque
 * `financeiro-api.ts#exportar` era `SUBSTITUIR POR: GET
 * /financeiro/titulos/export`, nunca implementado.
 *
 * Simples de proposito: sincrono, sem fila nem notificacao — a mesma lista
 * que a tela ja mostra (`listPayables`/`listReceivables`), so serializada em
 * outro formato. A exportacao formal para o contador (RF-087, RF-088 — pacote
 * com XML fiscal, processado em segundo plano) e outra tarefa: QST-005 (qual
 * contador valida o formato) ainda nao tem resposta, e nao ha por que travar
 * este botao nela.
 */

export type LinhaExportavel = {
  readonly contraparte: string
  readonly descricao: string
  /** Plano de conta (pagar) ou parcela (receber). Vazio quando nao se aplica. */
  readonly classificacao: string
  readonly vencimento: string
  readonly valorCents: number
  readonly baixadoCents: number
  readonly status: 'open' | 'partially_settled' | 'settled' | 'cancelled'
}

const ROTULO_STATUS: Record<LinhaExportavel['status'], string> = {
  open: 'Em aberto',
  partially_settled: 'Baixa parcial',
  settled: 'Quitado',
  cancelled: 'Cancelado',
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function paraReais(cents: number): string {
  return Money.fromCents(cents).format()
}

/**
 * `;` e nao `,`: o valor ja formatado ("R$ 1.234,56") tem virgula decimal, e
 * `;` e o separador que o Excel em pt-BR espera — com `,` cada valor sairia
 * cortado ao meio sem precisar de aspas para avisar que algo esta errado.
 */
const SEPARADOR = ';'

const escaparCsv = (valor: string): string =>
  /["\r\n;]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor

/** CSV das contas — pensado para abrir direto no Excel/LibreOffice. */
export function paraCsv(rotuloClassificacao: string, linhas: readonly LinhaExportavel[]): string {
  const cabecalho = [
    'Contraparte',
    'Descrição',
    rotuloClassificacao,
    'Vencimento',
    'Valor',
    'Baixado',
    'Saldo',
    'Situação',
  ]

  const corpo = linhas.map((l) => [
    l.contraparte,
    l.descricao,
    l.classificacao,
    formatarData(l.vencimento),
    paraReais(l.valorCents),
    paraReais(l.baixadoCents),
    paraReais(l.valorCents - l.baixadoCents),
    ROTULO_STATUS[l.status],
  ])

  const totalSaldo = linhas.reduce((soma, l) => soma + (l.valorCents - l.baixadoCents), 0)
  const rodape = ['Total', '', '', '', '', '', paraReais(totalSaldo), '']

  const todasAsLinhas = [cabecalho, ...corpo, [], rodape]
  /* BOM UTF-8 explicito via escape (nao um byte literal no arquivo-fonte):
     sem ele, o Excel do Windows abre acento e cedilha como lixo, por assumir
     Latin-1 quando o arquivo nao diz o contrario. */
  const BOM_UTF8 = String.fromCharCode(0xfeff)
  return BOM_UTF8 + todasAsLinhas.map((l) => l.map(escaparCsv).join(SEPARADOR)).join('\r\n')
}

/* -------------------------------------------------------------------------- */
/* PDF — lista compacta, para imprimir ou anexar                              */
/* -------------------------------------------------------------------------- */

const PAGINA = { largura: 595.28, altura: 841.89 } // A4 em pontos
const MARGEM = 40
const ALTURA_LINHA = 16

/** x de cada coluna a partir da margem esquerda, e o alinhamento. */
const COLUNAS = [
  { titulo: 'Contraparte', x: 0, largura: 150, alinhar: 'esquerda' as const },
  { titulo: 'Descrição', x: 150, largura: 175, alinhar: 'esquerda' as const },
  { titulo: 'Vencimento', x: 325, largura: 65, alinhar: 'esquerda' as const },
  { titulo: 'Saldo', x: 390, largura: 80, alinhar: 'direita' as const },
  { titulo: 'Situação', x: 470, largura: 85, alinhar: 'esquerda' as const },
]

/** Corta o texto para nao vazar da coluna — sem quebra de linha, de proposito. */
function encurtar(texto: string, largura: number, medir: (t: string) => number): string {
  if (medir(texto) <= largura) return texto
  let cortado = texto
  while (cortado.length > 1 && medir(`${cortado}…`) > largura) {
    cortado = cortado.slice(0, -1)
  }
  return `${cortado}…`
}

export async function paraPdf(
  titulo: string,
  geradoEm: Date,
  linhas: readonly LinhaExportavel[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonte = await doc.embedFont(StandardFonts.Helvetica)
  const fonteNegrito = await doc.embedFont(StandardFonts.HelveticaBold)

  let pagina = doc.addPage([PAGINA.largura, PAGINA.altura])
  let y = PAGINA.altura - MARGEM

  const escreverCelula = (
    texto: string,
    coluna: (typeof COLUNAS)[number],
    tamanho: number,
    f: typeof fonte,
  ) => {
    const medir = (t: string) => f.widthOfTextAtSize(t, tamanho)
    const cortado = encurtar(texto, coluna.largura - 4, medir)
    const larguraTexto = medir(cortado)
    const x = MARGEM + coluna.x + (coluna.alinhar === 'direita' ? coluna.largura - larguraTexto : 0)
    pagina.drawText(cortado, { x, y, size: tamanho, font: f, color: rgb(0.1, 0.1, 0.1) })
  }

  const desenharCabecalhoDaTabela = () => {
    for (const coluna of COLUNAS) escreverCelula(coluna.titulo, coluna, 9, fonteNegrito)
    y -= ALTURA_LINHA * 0.6
    pagina.drawLine({
      start: { x: MARGEM, y },
      end: { x: PAGINA.largura - MARGEM, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    })
    y -= ALTURA_LINHA * 0.6
  }

  const novaPagina = () => {
    pagina = doc.addPage([PAGINA.largura, PAGINA.altura])
    y = PAGINA.altura - MARGEM
    desenharCabecalhoDaTabela()
  }

  pagina.drawText(titulo, { x: MARGEM, y, size: 16, font: fonteNegrito })
  y -= ALTURA_LINHA
  pagina.drawText(`Gerado em ${geradoEm.toLocaleString('pt-BR')}`, {
    x: MARGEM,
    y,
    size: 9,
    font: fonte,
    color: rgb(0.4, 0.4, 0.4),
  })
  y -= ALTURA_LINHA * 1.5

  desenharCabecalhoDaTabela()

  for (const l of linhas) {
    if (y < MARGEM + ALTURA_LINHA) novaPagina()

    escreverCelula(l.contraparte, COLUNAS[0]!, 9, fonte)
    escreverCelula(l.descricao, COLUNAS[1]!, 9, fonte)
    escreverCelula(formatarData(l.vencimento), COLUNAS[2]!, 9, fonte)
    escreverCelula(paraReais(l.valorCents - l.baixadoCents), COLUNAS[3]!, 9, fonte)
    escreverCelula(ROTULO_STATUS[l.status], COLUNAS[4]!, 9, fonte)

    y -= ALTURA_LINHA
  }

  if (linhas.length === 0) {
    pagina.drawText('Nenhum título em aberto.', { x: MARGEM, y, size: 10, font: fonte })
    y -= ALTURA_LINHA
  }

  if (y < MARGEM + ALTURA_LINHA) novaPagina()
  const totalSaldo = linhas.reduce((soma, l) => soma + (l.valorCents - l.baixadoCents), 0)
  y -= ALTURA_LINHA * 0.5
  pagina.drawText(`Total em aberto: ${paraReais(totalSaldo)}`, {
    x: MARGEM,
    y,
    size: 10,
    font: fonteNegrito,
  })

  return doc.save()
}
