/**
 * Dispensar o checklist de primeiros passos — NR-104.
 *
 * So guarda ISSO: que a pessoa pediu para nao ver mais o cartao. Terminar os
 * tres passos ja esconde o cartao sozinho (ver `ChecklistInicial`) — esta
 * chave e so para quem quer dispensa-lo antes disso.
 */

/** Documentada no inventario de cookies — lib/cookies.ts. */
export const CHAVE_CHECKLIST_DISPENSADO = 'nr:checklist-dispensado'

const ouvintes = new Set<() => void>()

function notificar(): void {
  for (const ouvinte of ouvintes) ouvinte()
}

export function assinarChecklistDispensado(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function lerChecklistDispensado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_CHECKLIST_DISPENSADO) === '1'
  } catch {
    return false
  }
}

export function lerChecklistDispensadoNoServidor(): boolean {
  return false
}

export function dispensarChecklist(): void {
  try {
    window.localStorage.setItem(CHAVE_CHECKLIST_DISPENSADO, '1')
  } catch {
    /* Sem onde gravar, o cartao volta a aparecer na proxima visita — mesma
       decisao do tema, do som e da meta. */
  }
  notificar()
}
