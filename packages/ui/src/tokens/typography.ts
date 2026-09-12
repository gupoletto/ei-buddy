/**
 * Tipografia.
 *
 * Os tamanhos vem da persona, nao da estetica: a P1 usa o sistema em pe,
 * atras do balcao, com cliente esperando. Por isso a escala nao desce de 12 —
 * abaixo disso ela nao le sem aproximar o aparelho do rosto.
 */

/** Tamanhos em pixels. O RN trata como pontos independentes de densidade. */
export const fontSize = {
  micro: 12,
  small: 13,
  body: 15,
  medium: 17,
  title: 21,
  display: 28,
} as const

/**
 * Pesos como string porque e isso que o React Native aceita em `fontWeight`;
 * no CSS o valor e o mesmo.
 */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

/**
 * Familias.
 *
 * A marca pede BC Alphapipe e BD Colonius (material ProComercio; o nome do
 * produto e EiBuddy, ADR-0011), que ainda nao foram licenciadas. Ate la,
 * Poppins para display e Inter para corpo — a fallback completa existe para
 * que a troca de fonte nao mude o layout.
 */
export const fontFamily = {
  display: "'Segoe UI', system-ui, sans-serif",
  body: "'Segoe UI', system-ui, sans-serif",
} as const

/**
 * Altura de linha como multiplicador do tamanho da fonte.
 *
 * Texto corrido precisa de mais respiro que titulo: em titulo grande, 1.5
 * afasta as linhas a ponto de elas nao lerem mais como um bloco so.
 */
export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
} as const
