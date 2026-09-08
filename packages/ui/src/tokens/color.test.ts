import { describe, expect, it } from 'vitest'
import { AA_NORMAL_TEXT, contrastRatio, flatten, meetsAA } from '../contrast.js'
import { brand, dark, light } from './color.js'

/**
 * RNF-055 executavel.
 *
 * Cada par aqui e uma combinacao que aparece de verdade nas telas. O teste
 * existe para que trocar um token — o que vai acontecer quando a DEC-001
 * fechar — nao consiga degradar o contraste em silencio.
 */

const paresClaro: ReadonlyArray<readonly [string, string, string]> = [
  ['texto sobre fundo', light.text, light.bg],
  ['texto secundario sobre fundo', light.textSecondary, light.bg],
  ['texto de apoio sobre fundo', light.textMuted, light.bg],
  ['texto de apoio sobre fundo suave', light.textMuted, light.bgMuted],
  ['texto sobre a cor primaria', light.textOnBrand, brand.primary],
  ['erro sobre fundo de erro', light.feedback.dangerText, light.feedback.dangerBg],
  ['alerta sobre fundo de alerta', light.feedback.warningText, light.feedback.warningBg],
  ['sucesso sobre fundo de sucesso', light.feedback.successText, light.feedback.successBg],
]

const paresEscuro: ReadonlyArray<readonly [string, string, string]> = [
  ['texto sobre fundo', dark.text, dark.bg],
  ['texto de apoio sobre fundo', dark.textMuted, dark.bg],
  ['texto de apoio sobre superficie', dark.textMuted, dark.surface],
  ['texto de apoio sobre superficie alta', dark.textMuted, dark.surfaceRaised],
  ['texto sobre o accent', dark.textOnAccent, brand.accent],
  ['erro sobre fundo', dark.feedback.danger, dark.bg],
  ['alerta sobre superficie', dark.feedback.warning, dark.surface],
  ['sucesso sobre superficie', dark.feedback.success, dark.surface],
]

describe('tema claro atende ao WCAG AA', () => {
  it.each(paresClaro)('%s', (_nome, frente, fundo) => {
    expect(contrastRatio(frente, fundo)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})

describe('tema escuro atende ao WCAG AA', () => {
  it.each(paresEscuro)('%s', (_nome, frente, fundo) => {
    expect(contrastRatio(frente, fundo)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})

/*
 * As superficies TRANSLUCIDAS, achatadas sobre o que fica atras.
 *
 * `field` e os tres fundos de feedback sao `rgba` — respectivamente todo campo
 * de entrada e toda caixa de alerta do sistema. `contrastRatio` recusava
 * `rgba`, e como nenhum teste tentava medi-los, a recusa nao parava nada: a
 * verificacao da RNF-055 tinha um ponto cego exatamente sobre onde o lojista
 * digita dinheiro e onde o sistema avisa que algo deu errado.
 *
 * Cada par entra duas vezes, sobre o fundo da tela e sobre o cartao, porque o
 * contraste de translucido depende do que esta atras — e os dois casos existem
 * nas telas.
 */
const paresTranslucidosEscuro: ReadonlyArray<readonly [string, string, string]> = (
  [
    ['campo', dark.field, dark.text],
    ['campo (placeholder)', dark.field, dark.textMuted],
    ['fundo de erro', dark.feedback.dangerBg, dark.feedback.danger],
    ['fundo de alerta', dark.feedback.warningBg, dark.feedback.warning],
    ['fundo de sucesso', dark.feedback.successBg, dark.feedback.success],
  ] as const
).flatMap(
  ([nome, fundo, frente]) =>
    [
      [`${nome} sobre a tela`, frente, flatten(fundo, dark.bg)],
      [`${nome} sobre o cartao`, frente, flatten(fundo, dark.surface)],
    ] as const,
)

describe('superficies translucidas do tema escuro atendem ao WCAG AA', () => {
  it.each(paresTranslucidosEscuro)('%s', (_nome, frente, fundo) => {
    expect(contrastRatio(frente, fundo)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })
})

/**
 * Quais cores podem ser TEXTO no tema escuro.
 *
 * Esta lista existe por causa de quatro bugs reais achados no app mobile, todos
 * com a mesma causa: `brand.primary` e um azul-marinho de tema CLARO. Sobre o
 * fundo escuro ele fica a 1,44:1 — invisivel como texto — e, usado como fundo
 * de botao, nao suporta o `textOnAccent`, que e quase preto (1,12:1).
 *
 * O indicador em destaque da tela inicial e o rotulo do atalho principal
 * estavam ilegiveis por isso. Nenhum teste podia pegar, porque o teste antigo
 * so media os pares que ja se sabia estarem certos.
 *
 * A regra que fica: uma cor institucional so pode ser TEXTO no escuro se
 * passar AA sobre as tres superficies. `primary` e `highlight` nao passam — e
 * a asserção abaixo e o que impede alguem de tentar de novo.
 */
const superficiesEscuras = [
  ['tela', dark.bg],
  ['cartao', dark.surface],
  ['cartao elevado', dark.surfaceRaised],
] as const

describe('cor institucional como texto no tema escuro', () => {
  it.each(superficiesEscuras)('o accent serve como texto sobre %s', (_onde, fundo) => {
    expect(meetsAA(brand.accent, fundo)).toBe(true)
  })

  /*
   * Documenta o limite em vez de escondê-lo. Quem for usar `primary` ou
   * `highlight` como cor de texto no escuro encontra este teste primeiro, e
   * com ele o motivo.
   */
  it.each([
    ['primary', brand.primary],
    ['highlight', brand.highlight],
  ])('%s NAO serve como texto no escuro — e cor de tema claro', (_nome, cor) => {
    for (const [, fundo] of superficiesEscuras) {
      expect(meetsAA(cor, fundo)).toBe(false)
    }
  })

  /*
   * `primary` como FUNDO e legitimo — o avatar do cliente faz isso — mas so
   * sob texto CLARO. Sob `textOnAccent`, que e quase preto, da 1,12:1.
   */
  it('primary como fundo aceita texto claro, nao o texto sobre accent', () => {
    expect(meetsAA(dark.text, brand.primary)).toBe(true)
    expect(meetsAA(dark.textOnAccent, brand.primary)).toBe(false)
  })
})

describe('a paleta da marca nao se confunde com feedback', () => {
  it('nenhuma cor de feedback repete uma cor institucional', () => {
    const institucionais = new Set<string>(Object.values(brand))
    const feedbackClaro = Object.values(light.feedback)

    for (const cor of feedbackClaro) {
      expect(institucionais.has(cor)).toBe(false)
    }
  })
})
