import type { SupplierSearchOutput, SupplierSuggestionsOutput } from '@na-regua/contracts'
import type { ExecutionContext } from '../context.js'
import type { SupplierDirectory } from '../ports/connections.js'

export type SearchSuppliersDeps = {
  readonly suppliers: SupplierDirectory
}

/**
 * Quem vende um produto, perto de mim — RF-01, RF-02, ADR-0008.
 *
 * Nao exige `assertCanWrite`: e leitura, e a regra de negocio 3 pede que
 * funcione mesmo para quem ainda nao cadastrou produto nenhum (so compra
 * nesta interacao) — nada aqui depende do catalogo da PROPRIA empresa.
 */
export async function searchSuppliers(
  deps: SearchSuppliersDeps,
  ctx: ExecutionContext,
  term: string,
): Promise<SupplierSearchOutput> {
  const linhas = await deps.suppliers.search(ctx.companyId, term)

  return {
    results: linhas.map((l) => ({
      companyId: l.companyId,
      companyName: l.companyName,
      neighborhood: l.neighborhood,
      city: l.city,
      distanceKm: l.distanceKm,
      products: [...l.products],
    })),
  }
}

/**
 * Empresas que outras do MESMO ramo ja se conectaram — RF-01 (aditivo), ADR-0008.
 *
 * Leitura, sem `assertCanWrite`. Vazia ate haver conexao aceita entre pares
 * do mesmo ramo — nao e erro, e o estado esperado enquanto a base e pequena
 * (o mesmo risco ja registrado na DEC-021).
 */
export async function suggestSuppliers(
  deps: SearchSuppliersDeps,
  ctx: ExecutionContext,
): Promise<SupplierSuggestionsOutput> {
  const linhas = await deps.suppliers.suggest(ctx.companyId)

  return {
    suggestions: linhas.map((l) => ({
      companyId: l.companyId,
      companyName: l.companyName,
      neighborhood: l.neighborhood,
      city: l.city,
      distanceKm: l.distanceKm,
      peerCount: l.peerCount,
    })),
  }
}
