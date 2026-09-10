/**
 * Meta diaria de faturamento — NR-104.
 *
 * ## Por que so no navegador, e nao no cadastro da empresa
 *
 * Uma meta "de verdade" seria campo da empresa, com endpoint e migracao
 * proprios — trabalho de banco que este pacote (so `web`) nao faz sozinho.
 * Guardar em `localStorage`, no mesmo padrao de `tema-painel.ts`/`som.ts`, da
 * o essencial (a pessoa define um numero e ve o progresso) sem esperar por
 * isso. O preco e nao acompanhar a pessoa entre aparelhos — aceitavel para uma
 * preferencia que ela mesma define em segundos, de novo, se precisar.
 *
 * ## Por que centavos, e nao reais
 *
 * `Money`/centavos e o tipo de dinheiro do sistema inteiro (`packages/money`).
 * Guardar reais aqui — so porque e "so uma preferencia de tela" — reabriria a
 * classe de bug de arredondamento que o resto do sistema existe pra evitar.
 */

/** Documentada no inventario de cookies — lib/cookies.ts. */
export const CHAVE_META = 'nr:meta-diaria'

const ouvintes = new Set<() => void>()

function notificar(): void {
  for (const ouvinte of ouvintes) ouvinte()
}

export function assinarMeta(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

/** `null` = sem meta definida. */
export function lerMeta(): number | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE_META)
    if (bruto === null) return null
    const centavos = Number.parseInt(bruto, 10)
    return Number.isFinite(centavos) && centavos > 0 ? centavos : null
  } catch {
    return null
  }
}

export function lerMetaNoServidor(): number | null {
  return null
}

export function definirMeta(centavos: number | null): void {
  try {
    if (centavos === null || centavos <= 0) {
      window.localStorage.removeItem(CHAVE_META)
    } else {
      window.localStorage.setItem(CHAVE_META, String(Math.round(centavos)))
    }
  } catch {
    /* Sem onde gravar, a meta nao sobrevive a proxima visita — mesma decisao
       do tema, do som e do aviso de cookies. */
  }
  notificar()
}
