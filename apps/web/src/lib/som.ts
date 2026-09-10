/**
 * Som do painel — bipe do leitor e confirmacao de venda fechada.
 *
 * ## Por que sintetizado, e nao um arquivo de audio
 *
 * Um `.mp3`/`.wav` e peso de bundle e uma decisao de design (que som exatamente)
 * dificil de revisar num PR. `AudioContext` sintetiza os dois sons em poucas
 * linhas, sem asset nenhum — e o mesmo motivo de `IconSun`/`IconMoon` serem SVG
 * inline em vez de PNG.
 *
 * ## Por que o padrao assinar/ler/alternar de novo
 *
 * Mesmo idioma de `lib/tema-painel.ts`: a preferencia mora fora do React (aqui,
 * so em `localStorage`, sem atributo no DOM porque nao ha nada visual para
 * evitar um flash) e `useSyncExternalStore` e quem consome.
 */

export type PreferenciaDeSom = 'ligado' | 'desligado'

/** Documentada no inventario de cookies — lib/cookies.ts. */
export const CHAVE_SOM = 'nr:som'

const ouvintes = new Set<() => void>()

function lerArmazenamento(): PreferenciaDeSom {
  try {
    return window.localStorage.getItem(CHAVE_SOM) === 'off' ? 'desligado' : 'ligado'
  } catch {
    return 'ligado'
  }
}

export function assinarSom(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function lerSom(): PreferenciaDeSom {
  return lerArmazenamento()
}

/** Sem `localStorage` no servidor: o padrao (ligado) e o mesmo dos dois lados,
    entao nao ha flash de icone a evitar — diferente do tema, nao precisa de
    script pre-hidratacao. */
export function lerSomNoServidor(): PreferenciaDeSom {
  return 'ligado'
}

export function alternarSom(): void {
  const proximo: PreferenciaDeSom = lerArmazenamento() === 'ligado' ? 'desligado' : 'ligado'

  try {
    window.localStorage.setItem(CHAVE_SOM, proximo === 'ligado' ? 'on' : 'off')
  } catch {
    /* Sem onde gravar, a escolha nao sobrevive a proxima visita — mas vale
       para esta. Mesma decisao do tema e do AvisoDeCookies. */
  }

  for (const ouvinte of ouvintes) ouvinte()
}

/**
 * Um `AudioContext` por chamada, fechado logo depois de tocar.
 *
 * Manter um contexto vivo entre navegacoes daria vazamento e complicaria o
 * componente que chama — um som que dura 100-300ms nao precisa de estado
 * persistente. `try/catch`: a politica de autoplay do navegador pode recusar,
 * e Safari ainda usa o prefixo `webkit`.
 */
function novoContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    return new Ctor()
  } catch {
    return null
  }
}

function tocarNota(ctx: AudioContext, frequencia: number, inicioEm: number, duracao: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequencia

  const t0 = ctx.currentTime + inicioEm
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao)

  osc.connect(gain).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duracao + 0.02)
}

/** Bipe curto e agudo — mesma familia sonora de leitora de mercado. */
export function tocarBipe(): void {
  if (lerSom() === 'desligado') return
  const ctx = novoContexto()
  if (!ctx) return
  tocarNota(ctx, 1500, 0, 0.09)
  setTimeout(() => void ctx.close(), 200)
}

/** Duas notas subindo — o "pronto" de uma venda fechada, sem virar jingle. */
export function tocarConfirmacao(): void {
  if (lerSom() === 'desligado') return
  const ctx = novoContexto()
  if (!ctx) return
  tocarNota(ctx, 880, 0, 0.11)
  tocarNota(ctx, 1318.5, 0.09, 0.16)
  setTimeout(() => void ctx.close(), 400)
}
