import { describe, expect, it } from 'vitest'
import { AA_NORMAL_TEXT, contrastRatio, flatten, meetsAA } from './contrast.js'

describe('contrastRatio', () => {
  it.each([
    ['#000000', '#ffffff', 21],
    ['#ffffff', '#ffffff', 1],
    ['#000000', '#000000', 1],
  ])('%s sobre %s da %s:1', (a, b, esperado) => {
    expect(contrastRatio(a, b)).toBeCloseTo(esperado, 2)
  })

  it('nao depende da ordem dos argumentos', () => {
    expect(contrastRatio('#1e2a78', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#1e2a78'), 10)
  })

  it('trata a forma curta como a longa', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(contrastRatio('#ffffff', '#000000'), 10)
  })

  it('recusa cor invalida', () => {
    expect(() => contrastRatio('vermelho', '#fff')).toThrow(RangeError)
    expect(() => contrastRatio('#ff', '#fff')).toThrow(RangeError)
    expect(() => contrastRatio('#gggggg', '#fff')).toThrow(RangeError)
    expect(() => contrastRatio('', '#fff')).toThrow(RangeError)
    /* Sem o `#` tambem e invalido — evita aceitar 'ffffff' por engano. */
    expect(() => contrastRatio('ffffff', '#000')).toThrow(RangeError)
  })
})

describe('meetsAA', () => {
  it('aceita no piso e recusa abaixo dele', () => {
    /* #767c9b sobre branco da 4.10:1 — era o textMuted antigo. */
    expect(meetsAA('#767c9b', '#ffffff')).toBe(false)
    expect(meetsAA('#6a708c', '#ffffff')).toBe(true)
    expect(contrastRatio('#6a708c', '#ffffff')).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})

describe('flatten', () => {
  /*
   * Existe porque `field` e os tres fundos de feedback sao `rgba`: todo campo
   * de entrada e toda caixa de alerta do sistema. Sem achatar, `contrastRatio`
   * os recusava, e a verificacao da RNF-055 tinha um vao exatamente ali.
   */
  it('achata branco a 4% sobre a superficie escura', () => {
    expect(flatten('rgba(255, 255, 255, 0.04)', '#161c42')).toBe('#1f254a')
  })

  /* O contraste de translucido NAO e propriedade dela sozinha: o mesmo rgba
     sobre a tela e sobre o cartao da resultados diferentes. */
  it('o mesmo rgba sobre fundos diferentes da resultados diferentes', () => {
    const cor = 'rgba(255, 255, 255, 0.04)'
    expect(flatten(cor, '#0e1330')).not.toBe(flatten(cor, '#161c42'))
  })

  it.each([
    ['alpha 0 deixa o fundo intacto', 'rgba(255, 0, 0, 0)', '#123456', '#123456'],
    ['alpha 1 devolve a propria cor', 'rgba(255, 0, 0, 1)', '#123456', '#ff0000'],
    ['rgb sem alpha e opaca', 'rgb(255, 0, 0)', '#123456', '#ff0000'],
  ])('%s', (_nome, cor, fundo, esperado) => {
    expect(flatten(cor, fundo)).toBe(esperado)
  })

  /* Cor opaca passa reta: quem chama nao precisa saber se e translucida. */
  it.each(['#fff', '#161c42', 'transparent', 'currentColor'])('devolve %s como esta', (cor) => {
    expect(flatten(cor, '#000000')).toBe(cor)
  })

  /*
   * A leitura e estrutural, e nao por expressao regular, porque a primeira
   * versao usava um padrao com `\s*` ao redor de um grupo opcional e o CodeQL
   * a reprovou como `js/polynomial-redos`. Numa entrada sem `)` e com muitos
   * espacos, o motor tentava todas as formas de distribui-los.
   *
   * O limite de tempo e generoso: o que se afirma e a ORDEM de grandeza.
   * Linear termina em milissegundos; quadratico nao termina.
   */
  it('nao trava com entrada hostil sem fechamento', () => {
    const hostil = `rgba(1,1,1${' '.repeat(200_000)}`

    const comecou = performance.now()
    const r = flatten(hostil, '#000000')
    const levou = performance.now() - comecou

    expect(r).toBe(hostil)
    expect(levou).toBeLessThan(1_000)
  })

  it.each([
    ['canal acima de 255', 'rgba(300, 0, 0, 0.5)'],
    ['alpha acima de 1', 'rgba(0, 0, 0, 2)'],
    ['campos de menos', 'rgba(1, 2)'],
    ['campos de mais', 'rgba(1, 2, 3, 0.5, 9)'],
    ['canal nao numerico', 'rgba(a, b, c, 0.5)'],
  ])('recusa %s e devolve a entrada intacta', (_nome, cor) => {
    expect(flatten(cor, '#000000')).toBe(cor)
  })
})
