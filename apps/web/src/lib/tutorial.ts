/**
 * Tutorial guiado do painel — NR-101.
 *
 * ## Duas coisas diferentes, dois armazenamentos diferentes
 *
 * "Ja vi o tutorial?" precisa sobreviver ao fechar o navegador — por isso
 * `localStorage`, mesmo padrao de `tema-painel.ts`/`som.ts`. "O tutorial esta
 * NA TELA agora?" e estado de sessao, nao precisa (nem deve) sobreviver a um
 * F5 — por isso mora so em memoria, num segundo par de ouvintes.
 *
 * ## Por que o motor mora em `AppShell`, e nao num layout separado
 *
 * O tutorial aponta para elementos que existem em DOIS lugares: a barra
 * lateral e o topo (AppShell) e o conteudo do dashboard (`app/app/page.tsx`).
 * `document.querySelector('[data-tutorial="..."]')` encontra os dois porque
 * estao na mesma arvore — nao precisa de um Contexto React para isso, so de
 * o motor estar montado depois que a pagina inteira pintou.
 */

/** Documentada no inventario de cookies — lib/cookies.ts. */
export const CHAVE_TUTORIAL = 'nr:tutorial-visto'

export function tutorialJaVisto(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_TUTORIAL) === '1'
  } catch {
    /* Sem onde ler, trata como "ja visto" — melhor nao repetir o tutorial a
       cada visita do que empurra-lo para quem nao tem localStorage
       disponivel (aba privada restritiva) e nao pode marca-lo como visto. */
    return true
  }
}

function marcarComoVisto(): void {
  try {
    window.localStorage.setItem(CHAVE_TUTORIAL, '1')
  } catch {
    /* Idem: sem onde gravar, nao ha o que fazer — o tutorial so reaparece
       nesta mesma visita. */
  }
}

/* ---------------------------------------------------------------------- *
 * Esta ativo AGORA? Estado de sessao, em memoria — nunca em localStorage.
 * ---------------------------------------------------------------------- */

let ativo = false
const ouvintes = new Set<() => void>()

function notificar(): void {
  for (const ouvinte of ouvintes) ouvinte()
}

export function assinarTutorialAtivo(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function lerTutorialAtivo(): boolean {
  return ativo
}

export function lerTutorialAtivoNoServidor(): boolean {
  return false
}

/** Chamado tanto pelo inicio automatico (primeiro login) quanto pelo botao de ajuda. */
export function iniciarTutorial(): void {
  ativo = true
  notificar()
}

/** Pular ou terminar dao no mesmo lugar: marcado como visto, sai da tela. */
export function encerrarTutorial(): void {
  ativo = false
  marcarComoVisto()
  notificar()
}
