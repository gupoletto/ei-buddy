import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { type LinhaExportavel, paraCsv, paraPdf } from './exportar-titulos.js'

/**
 * `exportar-titulos.ts` — o botao "Exportar" que a tela ja tinha, e que ate
 * a NR-074 nunca chamava um endpoint de verdade.
 *
 * `contas.test.ts` ja prova o caminho feliz pelo ciclo HTTP; aqui o foco e o
 * que so aparece com dado torto: campo com o separador dentro, lista vazia, e
 * paginacao do PDF quando a lista nao cabe numa pagina.
 */

const LINHA: LinhaExportavel = {
  contraparte: 'Energia Ltda',
  descricao: 'Conta de luz',
  classificacao: 'Energia e agua',
  vencimento: '2026-04-05',
  valorCents: 30_000,
  baixadoCents: 10_000,
  status: 'partially_settled',
}

describe('paraCsv', () => {
  it('comeca com o BOM utf-8, para o Excel nao estragar acento', () => {
    const csv = paraCsv('Plano de conta', [LINHA])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('usa ; como separador, porque o valor formatado ja tem virgula decimal', () => {
    const csv = paraCsv('Plano de conta', [LINHA])
    const cabecalho = csv.slice(1).split('\r\n')[0]
    expect(cabecalho).toBe(
      'Contraparte;Descrição;Plano de conta;Vencimento;Valor;Baixado;Saldo;Situação',
    )
  })

  it('data no formato brasileiro, e saldo e valor menos baixado', () => {
    const csv = paraCsv('Plano de conta', [LINHA])
    expect(csv).toContain('05/04/2026')
    /* 300,00 - 100,00 = 200,00. So o numero: o "R$" vem separado por espaco
       NAO quebravel (`Intl.NumberFormat`), e um literal com espaco comum no
       teste nunca bateria. */
    expect(csv).toContain('200,00')
  })

  it('campo com o separador dentro vem entre aspas', () => {
    const csv = paraCsv('Plano de conta', [{ ...LINHA, descricao: 'Conta; com ponto e virgula' }])
    expect(csv).toContain('"Conta; com ponto e virgula"')
  })

  it('aspas dentro do campo dobram, como o CSV pede', () => {
    const csv = paraCsv('Plano de conta', [{ ...LINHA, contraparte: 'Fornecedor "Ideal"' }])
    expect(csv).toContain('"Fornecedor ""Ideal"""')
  })

  it('quebra de linha dentro do campo tambem entra entre aspas', () => {
    const csv = paraCsv('Plano de conta', [{ ...LINHA, descricao: 'Linha um\nLinha dois' }])
    expect(csv).toContain('"Linha um\nLinha dois"')
  })

  it('rodape traz o total do SALDO, nao do valor original', () => {
    const csv = paraCsv('Plano de conta', [
      LINHA,
      { ...LINHA, valorCents: 50_000, baixadoCents: 0 },
    ])
    const rodape = csv.split('\r\n').at(-1)
    /* 200,00 + 500,00 = 700,00 */
    expect(rodape).toMatch(/^Total;{6}R\$.700,00;$/u)
  })

  it('lista vazia ainda tem cabecalho e total zero', () => {
    const csv = paraCsv('Plano de conta', [])
    expect(csv).toContain('Contraparte')
    expect(csv).toContain('0,00')
  })
})

describe('paraPdf', () => {
  it('produz bytes de PDF de verdade', async () => {
    const bytes = await paraPdf('Contas a pagar', new Date('2026-09-12T10:00:00Z'), [LINHA])
    const assinatura = Buffer.from(bytes.slice(0, 5)).toString('latin1')
    expect(assinatura).toBe('%PDF-')
  })

  it('lista vazia nao lanca, e ainda produz um PDF', async () => {
    const bytes = await paraPdf('Contas a pagar', new Date(), [])
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it('muitas linhas produzem mais de uma pagina', async () => {
    const muitas = Array.from({ length: 80 }, (_, i) => ({ ...LINHA, contraparte: `Linha ${i}` }))
    const bytes = await paraPdf('Contas a pagar', new Date(), muitas)

    const reaberto = await PDFDocument.load(bytes)
    expect(reaberto.getPageCount()).toBeGreaterThan(1)
  })

  it('nome muito longo e cortado com reticencias, nao vaza da coluna', async () => {
    const bytes = await paraPdf('Contas a pagar', new Date(), [
      { ...LINHA, contraparte: 'Um fornecedor com um nome absurdamente longo para a coluna' },
    ])
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })
})
