/**
 * Razao de contraste da WCAG 2.1.
 *
 * Existe aqui, e nao num teste, porque a RNF-055 e um requisito do produto e
 * nao uma checagem pontual: qualquer par de cores novo passa por esta funcao
 * antes de virar token. Sem isto o "contraste >= 4.5:1" vira intencao.
 */

/** Componentes RGB em 0–255. */
type Rgb = readonly [number, number, number]

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const RGBA =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([01]?(?:\.\d+)?)\s*)?\)$/i

function toRgb(hex: string): Rgb {
  if (!HEX.test(hex)) {
    throw new RangeError(`cor invalida: ${hex} — esperado #rgb ou #rrggbb`)
  }

  const raw = hex.slice(1)
  /* #abc e a forma curta de #aabbcc. */
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ] as const
}

const paraHex = (rgb: Rgb): string =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

/**
 * Achata uma cor translucida sobre o que esta atras dela.
 *
 * ## Por que isto e necessario, e nao um extra
 *
 * A paleta usa `rgba` em quatro lugares: o fundo de campo e os tres fundos de
 * feedback (`dangerBg`, `warningBg`, `successBg`). Sao, respectivamente, TODO
 * campo de entrada e TODA caixa de alerta do sistema.
 *
 * `contrastRatio` recusava `rgba` — e a recusa nao parava nada, porque nenhum
 * teste tentava medir esses pares. A RNF-055 pede "verificacao automatizada de
 * contraste", e ela existia com um ponto cego exatamente sobre onde o lojista
 * digita dinheiro e onde o sistema avisa que algo deu errado.
 *
 * Contraste de cor translucida nao e propriedade dela sozinha: o mesmo
 * `rgba(255,255,255,0.04)` sobre `#0e1330` e sobre `#161c42` da resultados
 * diferentes. Por isso a composicao precisa do fundo, e por isso ela e uma
 * funcao separada em vez de um remendo dentro de `toRgb`.
 */
export function flatten(color: string, over: string): string {
  const m = RGBA.exec(color.trim())
  if (m === null) {
    /* Ja e opaca: devolve como esta, para quem chama nao precisar decidir. */
    return color
  }

  const alpha = m[4] === undefined ? 1 : Number(m[4])
  const frente: Rgb = [Number(m[1]), Number(m[2]), Number(m[3])]
  const atras = toRgb(over)

  return paraHex([
    frente[0] * alpha + atras[0] * (1 - alpha),
    frente[1] * alpha + atras[1] * (1 - alpha),
    frente[2] * alpha + atras[2] * (1 - alpha),
  ] as const)
}

/**
 * Luminancia relativa — a formula da WCAG, que nao e a media dos canais: o
 * olho enxerga verde muito mais que azul, e os pesos refletem isso.
 */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as unknown as Rgb

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Razao entre duas cores, de 1 (identicas) a 21 (preto sobre branco).
 *
 * A ordem dos argumentos nao importa — a formula normaliza qual e a mais
 * clara, entao `contrastRatio(a, b) === contrastRatio(b, a)`.
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(toRgb(a))
  const lb = luminance(toRgb(b))
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)

  return (lighter + 0.05) / (darker + 0.05)
}

/** Piso da WCAG 2.1 AA para texto normal — RNF-055. */
export const AA_NORMAL_TEXT = 4.5

/** Piso para texto grande (>= 18.66px negrito ou >= 24px). */
export const AA_LARGE_TEXT = 3

/** Atende ao AA para texto normal? */
export function meetsAA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= AA_NORMAL_TEXT
}

/**
 * Atende ao AA quando o fundo e translucido sobre outra superficie?
 *
 * Tres cores e nao duas, porque o contraste de um fundo translucido depende do
 * que esta atras dele — a mesma caixa de alerta sobre o fundo da tela e sobre
 * um cartao da razoes diferentes. Quem chama precisa dizer qual dos dois.
 */
export function meetsAAOver(foreground: string, background: string, behind: string): boolean {
  return meetsAA(flatten(foreground, behind), flatten(background, behind))
}
