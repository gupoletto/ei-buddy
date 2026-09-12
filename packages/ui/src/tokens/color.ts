/**
 * Paleta.
 *
 * **Provisoria.** Os valores sao os da paleta ProComercio; o produto se chama
 * EiBuddy (ADR-0011). Quando houver arte propria, troca-se este arquivo e
 * nada mais — e exatamente para isso que os tokens existem.
 *
 * Nenhum componente escreve cor literal. O que nao esta aqui nao existe.
 */

/** Cores institucionais. Nunca usadas para dizer erro, alerta ou sucesso. */
export const brand = {
  primary: '#1e2a78',
  primaryDark: '#16205c',
  primarySoft: '#e9ebf7',
  accent: '#39c8bd',
  accentDark: '#24a79d',
  accentSoft: '#e4f7f5',
  /**
   * O accent como TEXTO sobre superficie clara — NR-099.
   *
   * `accent` (2.06:1) e ate `accentDark` (2.96:1) falham o piso de 4.5:1 como
   * texto sobre branco: sao tons pensados para POPAR sobre fundo escuro, o
   * mesmo motivo por que `primary` e `highlight` nao servem como texto no
   * escuro (ver color.test.ts). O painel ganhou tema claro opcional nesta
   * tarefa, e precisava do equivalente para o outro sentido.
   *
   * `#0f766e` e o mesmo matiz, escurecido ate passar — 5.47:1 sobre branco.
   * Nao e usado no site institucional (que nunca poe o accent como texto),
   * so no tema claro do painel.
   */
  accentText: '#0f766e',
  highlight: '#6d33dd',
  highlightSoft: '#efe8fd',
} as const

/**
 * Feedback deliberadamente FORA da paleta da marca.
 *
 * Se erro e destaque institucional dividem a mesma cor, a pessoa para de
 * distinguir os dois — e o roxo da marca vira "algo deu errado".
 */
const lightFeedback = {
  danger: '#d92d20',
  dangerText: '#b42318',
  dangerBg: '#fef3f2',
  dangerBorder: '#fda29b',

  warning: '#dc6803',
  warningText: '#b54708',
  warningBg: '#fffaeb',
  warningBorder: '#fec84b',

  success: '#079455',
  successText: '#067647',
  successBg: '#ecfdf3',
  successBorder: '#75e0a7',
} as const

/**
 * Feedback no tema escuro.
 *
 * Nao sao as mesmas cores do claro rebaixadas: sobre fundo escuro, um vermelho
 * saturado perde contraste e vibra. Os tons aqui sao mais claros de proposito.
 */
const darkFeedback = {
  danger: '#ff9c9c',
  dangerBg: 'rgba(255, 118, 118, 0.16)',
  warning: '#fdb022',
  warningBg: 'rgba(253, 176, 34, 0.16)',
  success: '#39c8bd',
  successBg: 'rgba(57, 200, 189, 0.14)',
} as const

/** Tema claro — site institucional e autenticacao. */
export const light = {
  bg: '#ffffff',
  bgMuted: '#f7f8fa',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  border: '#e6e8ef',
  borderStrong: '#d3d7e3',

  text: '#131734',
  textSecondary: '#4b5171',
  /**
   * Escurecido de #767c9b, que era o valor no globals.css e reprovava a
   * RNF-055: 4.10:1 sobre branco e 3.85:1 sobre `bgMuted`, abaixo do piso de
   * 4.5:1. Como e a cor de texto de apoio no site inteiro, a falha aparecia em
   * muita tela. O teste de contraste guarda os dois fundos.
   */
  textMuted: '#6a708c',
  textOnBrand: '#ffffff',

  feedback: lightFeedback,
} as const

/** Tema escuro — painel logado e o aplicativo inteiro. */
export const dark = {
  bg: '#0e1330',
  surface: '#161c42',
  surfaceRaised: '#1d2452',
  border: '#2a3268',
  /** Fundo de campo: transparencia para acompanhar a superficie sob ele. */
  field: 'rgba(255, 255, 255, 0.04)',

  text: '#eef0fb',
  textMuted: '#9aa2ce',
  /** Texto sobre o accent — quase preto, porque o accent e claro demais. */
  textOnAccent: '#06312e',

  feedback: darkFeedback,
} as const

export const color = { brand, light, dark } as const
